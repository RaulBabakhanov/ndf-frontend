const API_URL = import.meta.env.VITE_API_URL ?? 'https://ndf-backend.onrender.com/api/v1'

export interface DealerDto {
  id: number
  company: string
  official: string
  tax_number: string
  city: string
  address: string
  phone: string
  email: string
  discount_percent: string
}

export interface AuthDto {
  access_token: string
  token_type: string
  dealer: DealerDto
}

export interface RegistrationDto {
  message: string
  dealer: DealerDto
}

export interface ProductDto {
  id: number
  name: string
  category: string
  price_usd: string
  price_try: string | null
  price_eur: string | null
  default_currency: 'TRY' | 'USD' | 'EUR'
  image_url: string
  external_url: string
  stock: number
}

export interface ProductPageDto {
  items: ProductDto[]
  total: number
  page: number
  size: number
}

export interface OrderDto {
  id: number
  order_number: string
  status: string
  note: string
  shipping_address: string
  shipping_company: string
  tracking_number: string
  total_try: string
  created_at: string
  items: Array<{ product_id: number; quantity: number; unit_price_try: string }>
}

export interface ExchangeRatesDto {
  base: 'TRY'
  usd_try: string
  eur_try: string
  published_at: string
  fetched_at: string
  source: string
  cached: boolean
  stale: boolean
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('ndfAccessToken')
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: 'Sunucu hatası' }))
    const message = body.detail ?? 'İşlem tamamlanamadı'
    throw new ApiError(response.status, message)
  }
  return response.json() as Promise<T>
}

export const api = {
  register: (payload: Record<string, string>) => request<RegistrationDto>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (email: string, password: string, turnstileToken: string) => request<AuthDto>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, turnstile_token: turnstileToken, website: '' }) }),
  me: () => request<DealerDto>('/auth/me'),
  updateMe: (payload: { company: string; official: string; city: string; address: string; phone: string }) =>
    request<DealerDto>('/auth/me', { method: 'PATCH', body: JSON.stringify(payload) }),
  products: (page = 1, size = 100) => request<ProductPageDto>(`/products?page=${page}&size=${size}`),
  exchangeRates: () => request<ExchangeRatesDto>('/exchange-rates'),
  orders: () => request<OrderDto[]>('/orders'),
  createOrder: (items: Array<{ product_id: number; quantity: number }>, note: string, shippingAddress: string) =>
    request<OrderDto>('/orders', { method: 'POST', body: JSON.stringify({ items, note, shipping_address: shippingAddress }) }),
}

export function resolveApiAssetUrl(path: string): string {
  if (!path) return ''
  try {
    const parsed = new URL(path, new URL(API_URL).origin)
    if (parsed.pathname.startsWith('/uploads/')) return `${new URL(API_URL).origin}${parsed.pathname}`
    return parsed.toString()
  } catch {
    return path
  }
}
