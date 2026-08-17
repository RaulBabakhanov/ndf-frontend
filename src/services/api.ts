const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

export interface DealerDto {
  id: number
  company: string
  official: string
  tax_number: string
  city: string
  phone: string
  email: string
  discount_percent: string
}

export interface AuthDto {
  access_token: string
  token_type: string
  dealer: DealerDto
}

export interface OrderDto {
  id: number
  order_number: string
  status: string
  note: string
  total_try: string
  created_at: string
  items: Array<{ product_id: number; quantity: number; unit_price_try: string }>
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
    const message = response.status === 401 ? 'Oturum süreniz doldu. Lütfen tekrar giriş yapın.' : (body.detail ?? 'İşlem tamamlanamadı')
    throw new ApiError(response.status, message)
  }
  return response.json() as Promise<T>
}

export const api = {
  register: (payload: Record<string, string>) => request<AuthDto>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (email: string, password: string) => request<AuthDto>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<DealerDto>('/auth/me'),
  orders: () => request<OrderDto[]>('/orders'),
  createOrder: (items: Array<{ product_id: number; quantity: number }>, note: string) =>
    request<OrderDto>('/orders', { method: 'POST', body: JSON.stringify({ items, note }) }),
}
