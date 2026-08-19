<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import TurnstileWidget from './TurnstileWidget.vue'

interface Dealer {
  id: number
  company: string
  official: string
  email: string
  phone: string
  city: string
  address: string
  discount_percent: string
  is_approved: boolean
  created_at: string
}
interface Order {
  id: number
  order_number: string
  status: string
  note: string
  shipping_address: string
  shipping_company: string
  tracking_number: string
  total_try: string
  created_at: string
  dealer: { company: string; official: string; email: string; phone: string; address: string }
  items: Array<{ name: string; quantity: number; unit_price_try: string }>
}
type Currency = 'TRY' | 'USD' | 'EUR'
interface AdminProduct {
  id: number
  name: string
  category: string
  price_usd: string
  price_try: string
  price_eur: string
  default_currency: Currency
  stock: number
  image_url: string
}

const adminUsername = 'admin'
const adminPassword = ref('')
const adminToken = ref(sessionStorage.getItem('ndfAdminToken') || '')
const adminHeaders = () => ({ Authorization: `Bearer ${adminToken.value}` })
const authenticated = ref(false)
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
const adminTurnstileToken = ref('')
const adminCaptcha = ref<InstanceType<typeof TurnstileWidget> | null>(null)
const dealers = ref<Dealer[]>([])
const orders = ref<Order[]>([])
const products = ref<AdminProduct[]>([])
const productForm = ref<{
  name: string
  category: string
  price_try: number | null
  price_usd: number | null
  price_eur: number | null
  default_currency: Currency
  stock: number
}>({
  name: '',
  category: '',
  price_try: null,
  price_usd: null,
  price_eur: null,
  default_currency: 'USD',
  stock: 1,
})
const dealerForm = ref({
  company: '',
  official: '',
  tax_number: '',
  city: '',
  address: '',
  phone: '',
  email: '',
  password: '',
})
const productImage = ref<File | null>(null)
const productImagePreview = ref('')
const error = ref('')
const loading = ref(false)
const search = ref('')
const productSearch = ref('')
const productStockFilter = ref<'all' | 'available' | 'low' | 'out'>('all')
const savingProductId = ref<number | null>(null)
const deletingProductId = ref<number | null>(null)
const savingOrderStatusId = ref<number | null>(null)
const savingShippingId = ref<number | null>(null)
const deletingDealerId = ref<number | null>(null)
const expandedOrderId = ref<number | null>(null)
const success = ref('')
const exchangeRates = ref({ usd: '', eur: '', publishedAt: '', source: 'TCMB', stale: false })
const activeSection = ref<
  'overview' | 'orders' | 'dealers' | 'dealer-create' | 'products' | 'product-create' | 'analytics'
>('overview')
const orderFilter = ref('Tümü')
const orderStatuses = ['Onaylandı', 'Hazırlanıyor', 'Kargoda', 'Tamamlandı', 'İptal', 'Silindi'] as const
const orderFilters = ['Tümü', ...orderStatuses]
const dateFilter = ref<'Tümü' | 'Bugün' | 'Bu Ay' | 'Tarih Aralığı'>('Tümü')
const dateFilters = ['Tümü', 'Bugün', 'Bu Ay', 'Tarih Aralığı'] as const
const dateFrom = ref('')
const dateTo = ref('')
const apiUrl = import.meta.env.VITE_API_URL ?? 'https://api.ndf.allspacesoftware.com/api/v1'
const money = (value: string | number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value))
const date = (value: string) =>
  new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
async function loadExchangeRates() {
  try {
    const response = await fetch(`${apiUrl}/exchange-rates`)
    if (!response.ok) return
    const rates = await response.json()
    exchangeRates.value = {
      usd: rates.usd_try,
      eur: rates.eur_try,
      publishedAt: rates.published_at,
      source: rates.source,
      stale: rates.stale,
    }
  } catch {
    exchangeRates.value.stale = true
  }
}
const visibleOrders = computed(() =>
  orders.value.filter(
    (order) =>
      (orderFilter.value === 'Tümü' || order.status === orderFilter.value) &&
      matchesDateFilter(order.created_at) &&
      `${order.dealer.company} ${order.dealer.official} ${order.order_number} ${order.items.map((i) => i.name).join(' ')}`
        .toLocaleLowerCase('tr')
        .includes(search.value.toLocaleLowerCase('tr')),
  ),
)
function matchesDateFilter(value: string) {
  if (dateFilter.value === 'Tümü') return true
  const orderDate = new Date(value)
  const now = new Date()
  if (dateFilter.value === 'Bugün') return orderDate.toDateString() === now.toDateString()
  if (dateFilter.value === 'Bu Ay') return orderDate.getFullYear() === now.getFullYear() && orderDate.getMonth() === now.getMonth()
  const from = dateFrom.value ? new Date(`${dateFrom.value}T00:00:00`) : null
  const to = dateTo.value ? new Date(`${dateTo.value}T23:59:59.999`) : null
  return (!from || orderDate >= from) && (!to || orderDate <= to)
}
const totalSales = computed(() =>
  orders.value.reduce((sum, order) => sum + Number(order.total_try), 0),
)
const totalItems = computed(() =>
  orders.value.reduce(
    (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  ),
)
const visibleOrderSales = computed(() =>
  visibleOrders.value.reduce((sum, order) => sum + Number(order.total_try), 0),
)
const visibleOrderItems = computed(() =>
  visibleOrders.value.reduce(
    (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  ),
)
function cleanText(value: string) {
  let result = value
  const replacements: Record<string, string> = {
    'Ã‡': 'Ç', 'Ã§': 'ç', 'Ä°': 'İ', 'Ä±': 'ı', 'Ã–': 'Ö', 'Ã¶': 'ö',
    'Ãœ': 'Ü', 'Ã¼': 'ü', 'Äž': 'Ğ', 'ÄŸ': 'ğ', 'Åž': 'Ş', 'ÅŸ': 'ş',
  }
  Object.assign(replacements, {
    'Ã‡': 'Ç', 'Ã§': 'ç', 'Ä°': 'İ', 'Ä±': 'ı', 'Ã–': 'Ö', 'Ã¶': 'ö',
    'Ãœ': 'Ü', 'Ã¼': 'ü', 'Äž': 'Ğ', 'ÄŸ': 'ğ', 'Åž': 'Ş', 'ÅŸ': 'ş',
    'Â°': '°', 'Â·': '·', 'â€“': '–', 'â€”': '—', 'â€™': '’', 'â€œ': '“', 'â€': '”',
  })
  for (let pass = 0; pass < 3; pass++) {
    for (const [broken, correct] of Object.entries(replacements)) result = result.replaceAll(broken, correct)
  }
  return result
}
const visibleProducts = computed(() =>
  products.value.filter((product) => {
    const query = productSearch.value.toLocaleLowerCase('tr')
    const matchesSearch = `${product.name} ${product.category}`
      .toLocaleLowerCase('tr')
      .includes(query)
    const matchesStock =
      productStockFilter.value === 'all' ||
      (productStockFilter.value === 'available' && product.stock > 0) ||
      (productStockFilter.value === 'low' && product.stock > 0 && product.stock <= 2) ||
      (productStockFilter.value === 'out' && product.stock === 0)
    return matchesSearch && matchesStock
  }),
)
const pricedProductCount = computed(
  () =>
    products.value.filter((product) => product.price_try || product.price_usd || product.price_eur)
      .length,
)
const currencyName = (currency: Currency) => ({ TRY: 'TL', USD: 'Dolar', EUR: 'Euro' })[currency]
const categorySuggestions = computed(() =>
  [...new Set(products.value.map((product) => product.category))].sort((a, b) =>
    a.localeCompare(b, 'tr'),
  ),
)
const defaultPriceMissing = computed(() => {
  const prices = {
    TRY: productForm.value.price_try,
    USD: productForm.value.price_usd,
    EUR: productForm.value.price_eur,
  }
  return (
    prices[productForm.value.default_currency] === null ||
    prices[productForm.value.default_currency] === undefined
  )
})
function selectDefaultCurrency(currency: Currency) {
  productForm.value.default_currency = currency
}
function handleProductImage(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] || null
  productImage.value = file
  if (productImagePreview.value) URL.revokeObjectURL(productImagePreview.value)
  productImagePreview.value = file ? URL.createObjectURL(file) : ''
}

async function login() {
  loading.value = true
  error.value = ''
  try {
    if (!adminTurnstileToken.value) throw new Error('Lütfen bot doğrulamasını tamamlayın.')
    const response = await fetch(`${apiUrl}/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Turnstile-Token': adminTurnstileToken.value,
      },
      body: JSON.stringify({ username: adminUsername, password: adminPassword.value }),
    })
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))).detail
      throw new Error(response.status === 401 ? 'Yönetici anahtarı hatalı.' : detail || 'Veriler alınamadı.')
    }
    const result = await response.json()
    const data = result.dashboard
    adminToken.value = result.access_token
    dealers.value = data.dealers
    orders.value = data.orders.map((order: Order) => ({
      ...order,
      items: order.items.map((item) => ({ ...item, name: cleanText(item.name) })),
    }))
    products.value = data.products.map((product: AdminProduct) => ({
      ...product,
      name: cleanText(product.name),
      category: cleanText(product.category),
    }))
    authenticated.value = true
    sessionStorage.setItem('ndfAdminToken', adminToken.value)
    adminPassword.value = ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Bağlantı hatası.'
    adminCaptcha.value?.reset()
  } finally {
    loading.value = false
  }
}
async function refreshData() {
  error.value = ''
  const response = await fetch(`${apiUrl}/admin/dashboard`, {
    headers: adminHeaders(),
  })
  if (!response.ok) return void (error.value = 'Veriler yenilenemedi.')
  const data = await response.json()
  dealers.value = data.dealers
  orders.value = data.orders.map((order: Order) => ({
    ...order,
    items: order.items.map((item) => ({ ...item, name: cleanText(item.name) })),
  }))
  products.value = data.products.map((product: AdminProduct) => ({
    ...product,
    name: cleanText(product.name),
    category: cleanText(product.category),
  }))
}
onMounted(async () => {
  await loadExchangeRates()
  if (!adminToken.value) return
  await refreshData()
  if (!error.value) authenticated.value = true
  else sessionStorage.removeItem('ndfAdminToken')
})
async function updateOrderStatus(order: Order) {
  error.value = ''
  success.value = ''
  savingOrderStatusId.value = order.id
  const response = await fetch(`${apiUrl}/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: order.status }),
  })
  if (!response.ok) {
    savingOrderStatusId.value = null
    await refreshData()
    return void (error.value =
      (await response.json().catch(() => ({}))).detail || 'Sipariş durumu güncellenemedi.')
  }
  savingOrderStatusId.value = null
  success.value = `#${order.order_number} durumu ${order.status} olarak güncellendi.`
}
function statusClass(status: string) {
  return {
    'Onaylandı': 'approved',
    'Hazırlanıyor': 'preparing',
    'Kargoda': 'shipping',
    'Tamamlandı': 'completed',
    'İptal': 'cancelled',
    'Silindi': 'deleted',
  }[status] || 'preparing'
}
async function archiveOrder(order: Order) {
  if (!window.confirm(`#${order.order_number} tamamlanan siparişini Silindi bölümüne taşımak istiyor musunuz?`)) return
  const previousStatus = order.status
  order.status = 'Silindi'
  await updateOrderStatus(order)
  if (error.value) order.status = previousStatus
}
async function saveShipping(order: Order) {
  if (order.shipping_company.trim().length < 2 || order.tracking_number.trim().length < 3) {
    return void (error.value = 'Kargo firması ve geçerli takip numarası gereklidir.')
  }
  error.value = ''
  success.value = ''
  savingShippingId.value = order.id
  const response = await fetch(`${apiUrl}/admin/orders/${order.id}/shipping`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shipping_company: order.shipping_company,
      tracking_number: order.tracking_number,
    }),
  })
  if (!response.ok) {
    savingShippingId.value = null
    return void (error.value =
      (await response.json().catch(() => ({}))).detail || 'Kargo bilgileri kaydedilemedi.')
  }
  order.status = 'Kargoda'
  savingShippingId.value = null
  success.value = `#${order.order_number} kargoya verildi.`
}
function logout() {
  authenticated.value = false
  adminPassword.value = ''
  adminToken.value = ''
  dealers.value = []
  orders.value = []
  sessionStorage.removeItem('ndfAdminToken')
}
function exportOrders() {
  const popup = window.open('', '_blank', 'width=1200,height=850')
  if (!popup) return void alert('PDF çıktısı için açılır pencereye izin verin.')

  const rows = visibleOrders.value
    .map(
      (order) =>
        `<tr><td>#${escapeHtml(order.order_number)}</td><td><strong>${escapeHtml(order.dealer.company)}</strong><br><small>${escapeHtml(order.dealer.official)}</small></td><td>${escapeHtml(order.items.map((item) => `${item.quantity}× ${cleanText(item.name)}`).join(', '))}</td><td>${escapeHtml(date(order.created_at))}</td><td>${escapeHtml(order.status)}</td><td>${escapeHtml(money(order.total_try))}</td></tr>`,
    )
    .join('')
  const generatedAt = new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date())

  popup.document.write(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>NDF Sipariş Raporu</title><style>@page{size:A4 landscape;margin:14mm}*{box-sizing:border-box}body{margin:0;color:#142b55;font:12px Arial,sans-serif}.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:18px;border-bottom:3px solid #174b95}.logo{padding:10px 14px;border-radius:8px;background:#174b95;color:#fff;font-size:22px;font-weight:900;letter-spacing:4px}.header h1{margin:0;font-size:23px}.header p{margin:5px 0 0;color:#6f7d92}.summary{display:flex;gap:12px;margin:18px 0}.summary div{min-width:150px;padding:12px;border:1px solid #dce3ee;border-radius:8px}.summary span{display:block;color:#78869a;font-size:9px;text-transform:uppercase}.summary strong{display:block;margin-top:5px;font-size:16px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:10px 8px;text-align:left;border-bottom:1px solid #e1e6ee;vertical-align:top;overflow-wrap:anywhere}th{background:#174b95;color:#fff;font-size:9px;text-transform:uppercase}th:nth-child(1){width:10%}th:nth-child(2){width:17%}th:nth-child(3){width:32%}th:nth-child(4){width:12%}th:nth-child(5){width:12%}th:nth-child(6){width:17%}td:last-child,th:last-child{text-align:right}small{color:#78869a}.empty{padding:35px;text-align:center;color:#78869a}.footer{margin-top:22px;padding-top:10px;border-top:1px solid #dce3ee;color:#8692a4;font-size:9px;text-align:center}@media print{button{display:none}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><div class="header"><div class="logo">NDF</div><div><h1>Sipariş Raporu</h1><p>${escapeHtml(generatedAt)} tarihinde oluşturuldu</p></div></div><div class="summary"><div><span>Sipariş sayısı</span><strong>${visibleOrders.value.length}</strong></div><div><span>Ürün adedi</span><strong>${visibleOrderItems.value}</strong></div><div><span>Toplam satış</span><strong>${escapeHtml(money(visibleOrderSales.value))}</strong></div></div>${rows ? `<table><thead><tr><th>Sipariş No</th><th>Bayi</th><th>Ürünler</th><th>Tarih</th><th>Durum</th><th>Tutar</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">Seçili filtrelere uygun sipariş bulunamadı.</div>'}<div class="footer">NDF Makina · Yönetim paneli sipariş raporu</div><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`,
  )
  popup.document.close()
}
const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ||
      character,
  )
function printOrder(order: Order) {
  const popup = window.open('', '_blank', 'width=900,height=800')
  if (!popup) return void alert('PDF çıktısı için açılır pencereye izin verin.')
  const items = order.items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>${escapeHtml(money(item.unit_price_try))}</td><td>${escapeHtml(money(Number(item.unit_price_try) * item.quantity))}</td></tr>`,
    )
    .join('')
  popup.document.write(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(order.order_number)} Sipariş</title><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{margin:0;color:#142b55;font:14px Arial,sans-serif}.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:22px;border-bottom:3px solid #174b95}.logo{padding:12px 15px;border-radius:9px;background:#174b95;color:#fff;font-size:25px;font-weight:900;letter-spacing:5px}.header h1{margin:0;font-size:25px}.header p{margin:6px 0 0;color:#6f7d92}.info{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:28px 0}.box{padding:18px;border:1px solid #dce3ee;border-radius:10px}.box h3{margin:0 0 13px;color:#174b95;font-size:12px;text-transform:uppercase}.box p{margin:7px 0}.box span{color:#78869a}table{width:100%;border-collapse:collapse}th,td{padding:13px;text-align:left;border-bottom:1px solid #e1e6ee}th{background:#f0f4fa;color:#52617a;font-size:11px}td:nth-child(n+2),th:nth-child(n+2){text-align:right}.total{margin-top:22px;text-align:right;font-size:22px;font-weight:800}.note{margin-top:15px;padding:17px;border-radius:9px;background:#f4f7fb}.footer{margin-top:45px;padding-top:14px;border-top:1px solid #dce3ee;color:#8692a4;font-size:10px;text-align:center}@media print{button{display:none}}</style></head><body><div class="header"><div class="logo">NDF</div><div><h1>Sipariş Belgesi</h1><p>#${escapeHtml(order.order_number)}</p></div></div><div class="info"><div class="box"><h3>Bayi Bilgileri</h3><p><strong>${escapeHtml(order.dealer.company)}</strong></p><p><span>Yetkili:</span> ${escapeHtml(order.dealer.official)}</p><p><span>E-posta:</span> ${escapeHtml(order.dealer.email)}</p><p><span>Telefon:</span> ${escapeHtml(order.dealer.phone)}</p></div><div class="box"><h3>Sipariş Bilgileri</h3><p><span>Tarih:</span> ${escapeHtml(date(order.created_at))}</p><p><span>Durum:</span> ${escapeHtml(order.status)}</p></div></div><table><thead><tr><th>Ürün</th><th>Adet</th><th>Birim fiyat</th><th>Toplam</th></tr></thead><tbody>${items}</tbody></table><div class="total">Genel Toplam: ${escapeHtml(money(order.total_try))}</div>${order.shipping_address ? `<div class="note"><strong>Teslimat Adresi</strong><p>${escapeHtml(order.shipping_address)}</p></div>` : ''}${order.note ? `<div class="note"><strong>Sipariş Notu</strong><p>${escapeHtml(order.note)}</p></div>` : ''}<div class="footer">NDF Makina · Bu belge yönetim panelinden oluşturulmuştur.</div><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`,
  )
  popup.document.close()
}
async function addProduct() {
  error.value = ''
  success.value = ''
  if (defaultPriceMissing.value)
    return void (error.value = `${currencyName(productForm.value.default_currency)} varsayılan seçildiği için bu fiyat zorunludur.`)
  const data = new FormData()
  data.append('name', productForm.value.name)
  data.append('category', productForm.value.category)
  data.append('stock', String(productForm.value.stock))
  data.append('default_currency', productForm.value.default_currency)
  if (productForm.value.price_try !== null)
    data.append('price_try', String(productForm.value.price_try))
  if (productForm.value.price_usd !== null)
    data.append('price_usd', String(productForm.value.price_usd))
  if (productForm.value.price_eur !== null)
    data.append('price_eur', String(productForm.value.price_eur))
  if (productImage.value) data.append('image', productImage.value)
  const response = await fetch(`${apiUrl}/admin/products`, {
    method: 'POST',
    headers: adminHeaders(),
    body: data,
  })
  if (!response.ok)
    return void (error.value =
      (await response.json().catch(() => ({}))).detail || 'Ürün eklenemedi.')
  productForm.value = {
    name: '',
    category: '',
    price_try: null,
    price_usd: null,
    price_eur: null,
    default_currency: 'USD',
    stock: 1,
  }
  productImage.value = null
  if (productImagePreview.value) URL.revokeObjectURL(productImagePreview.value)
  productImagePreview.value = ''
  await refreshData()
  success.value = 'Ürün başarıyla eklendi.'
}
async function saveProduct(product: AdminProduct) {
  error.value = ''
  success.value = ''
  savingProductId.value = product.id
  const data = new FormData()
  data.append('stock', String(product.stock))
  data.append('default_currency', product.default_currency)
  if (product.price_try !== '') data.append('price_try', product.price_try)
  if (product.price_usd !== '') data.append('price_usd', product.price_usd)
  if (product.price_eur !== '') data.append('price_eur', product.price_eur)
  const response = await fetch(`${apiUrl}/admin/products/${product.id}`, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: data,
  })
  if (!response.ok) {
    savingProductId.value = null
    return void (error.value =
      (await response.json().catch(() => ({}))).detail || 'Ürün kaydedilemedi.')
  }
  await refreshData()
  savingProductId.value = null
  success.value = `${product.name} güncellendi.`
}
async function deleteProduct(product: AdminProduct) {
  if (!window.confirm(`${product.name} ürününü silmek istediğinize emin misiniz?`)) return
  error.value = ''
  success.value = ''
  deletingProductId.value = product.id
  const response = await fetch(`${apiUrl}/admin/products/${product.id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  })
  if (!response.ok) {
    deletingProductId.value = null
    return void (error.value =
      (await response.json().catch(() => ({}))).detail || 'Ürün silinemedi.')
  }
  await refreshData()
  deletingProductId.value = null
  success.value = `${product.name} silindi.`
}
async function addDealer() {
  const response = await fetch(`${apiUrl}/admin/dealers`, {
    method: 'POST',
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(dealerForm.value),
  })
  if (!response.ok)
    return void (error.value =
      (await response.json().catch(() => ({}))).detail || 'Bayi eklenemedi.')
  dealerForm.value = {
    company: '',
    official: '',
    tax_number: '',
    city: '',
    address: '',
    phone: '',
    email: '',
    password: '',
  }
  await refreshData()
  activeSection.value = 'overview'
}
async function saveDealerDiscount(dealer: Dealer) {
  error.value = ''
  const response = await fetch(`${apiUrl}/admin/dealers/${dealer.id}/discount`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ discount_percent: Number(dealer.discount_percent) }),
  })
  if (!response.ok)
    return void (error.value =
      (await response.json().catch(() => ({}))).detail || 'Cari indirimi kaydedilemedi.')
  await refreshData()
}
async function setDealerApproval(dealer: Dealer, isApproved: boolean) {
  error.value = ''
  success.value = ''
  const response = await fetch(`${apiUrl}/admin/dealers/${dealer.id}/approval`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_approved: isApproved }),
  })
  if (!response.ok)
    return void (error.value =
      (await response.json().catch(() => ({}))).detail || 'Bayi onay durumu güncellenemedi.')
  await refreshData()
  success.value = isApproved
    ? `${dealer.company} onaylandı ve artık giriş yapabilir.`
    : `${dealer.company} pasifleştirildi.`
}
async function deleteDealer(dealer: Dealer) {
  if (
    !window.confirm(
      `${dealer.company} isimli cariyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
    )
  )
    return
  error.value = ''
  success.value = ''
  deletingDealerId.value = dealer.id
  const response = await fetch(`${apiUrl}/admin/dealers/${dealer.id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  })
  if (!response.ok) {
    deletingDealerId.value = null
    return void (error.value =
      (await response.json().catch(() => ({}))).detail || 'Cari silinemedi.')
  }
  await refreshData()
  deletingDealerId.value = null
  success.value = `${dealer.company} silindi.`
}
</script>

<template>
  <main class="admin-shell">
    <section v-if="!authenticated" class="admin-login">
      <aside class="brand-panel">
        <div class="brand-logo">NDF</div>
        <div class="brand-copy">
          <span>NDF MAKİNA</span>
          <h2>Gücün ve güvenin yönetim merkezi.</h2>
          <p>
            Bayilerinizi, siparişlerinizi ve tüm satış hareketlerinizi tek bir güçlü panelden
            yönetin.
          </p>
        </div>
        <div class="brand-features">
          <div><b>01</b><span>Anlık satış takibi</span></div>
          <div><b>02</b><span>Merkezi bayi yönetimi</span></div>
          <div><b>03</b><span>Güvenli veri erişimi</span></div>
        </div>
        <small>© NDF Makina Yönetim Sistemi</small>
      </aside>
      <div class="login-form-panel">
        <div class="login-brand">
          <div class="admin-mark">NDF</div>
          <div><strong>NDF Makina</strong><small>Yönetim Merkezi</small></div>
        </div>
        <span>GÜVENLİ YÖNETİCİ ERİŞİMİ</span>
        <h1>Tekrar hoş geldiniz</h1>
        <p>Devam etmek için yönetici şifrenizle giriş yapın.</p>
        <form @submit.prevent="login">
          <label>Yönetici şifresi</label>
          <div class="password-field">
            <span>⌁</span
            ><input
              v-model="adminPassword"
              type="password"
              required
              autofocus
              autocomplete="current-password"
              placeholder="Şifrenizi girin"
            />
          </div>
          <TurnstileWidget
            ref="adminCaptcha"
            :site-key="turnstileSiteKey"
            @verified="adminTurnstileToken = $event"
          />
          <button :disabled="loading || !adminTurnstileToken">
            <span>{{ loading ? 'Kontrol ediliyor…' : 'Panele giriş yap' }}</span
            ><b>→</b>
          </button>
        </form>
        <em v-if="error">⚠ {{ error }}</em>
        <footer><span>🔒</span> Yetkisiz erişimler kayıt altına alınır.</footer>
      </div>
    </section>
    <template v-else>
      <div class="dashboard-layout">
        <aside class="dashboard-sidebar">
          <div class="side-brand">
            <b>NDF</b><span><strong>Yönetim</strong><small>Admin merkezi</small></span>
          </div>
          <nav>
            <small>ANA MENÜ</small
            ><button
              :class="{ active: activeSection === 'overview' }"
              @click="activeSection = 'overview'"
            >
              <span>⌂</span>Genel Bakış</button
            ><button
              :class="{ active: activeSection === 'orders' }"
              @click="activeSection = 'orders'"
            >
              <span>▤</span>Siparişler<b>{{ orders.length }}</b></button
            ><button
              :class="{ active: activeSection === 'dealers' }"
              @click="activeSection = 'dealers'"
            >
              <span>♙</span>Bayiler<b>{{ dealers.length }}</b></button
            ><button
              :class="{ active: activeSection === 'products' }"
              @click="activeSection = 'products'"
            >
              <span>▦</span>Ürünler<b>{{ products.length }}</b></button
            ><button
              :class="{ active: activeSection === 'product-create' }"
              @click="activeSection = 'product-create'"
            >
              <span>＋</span>Yeni Ürün</button
            ><button
              :class="{ active: activeSection === 'analytics' }"
              @click="activeSection = 'analytics'"
            >
              <span>⌁</span>Analiz</button
            ><small>YÖNETİM ARAÇLARI</small
            ><button
              :class="{ active: activeSection === 'dealer-create' }"
              @click="activeSection = 'dealer-create'"
            >
              <span>＋</span>Cari Ekle</button
            ><small>HIZLI ERİŞİM</small><a href="/">↗ Bayi sitesini aç</a>
          </nav>
          <div class="side-user">
            <span>A</span>
            <div><strong>Yönetici</strong><small>Aktif oturum</small></div>
            <button title="Çıkış yap" @click="logout">↪</button>
          </div>
        </aside>
        <section class="dashboard-main">
          <header class="dashboard-top">
            <div>
              <span class="mobile-logo">NDF</span>
              <p>
                <small>YÖNETİM MERKEZİ</small
                ><strong>{{
                  activeSection === 'overview'
                    ? 'Genel Bakış'
                    : activeSection === 'orders'
                      ? 'Sipariş Yönetimi'
                      : activeSection === 'dealers'
                        ? 'Bayi Yönetimi'
                        : activeSection === 'products'
                          ? 'Ürün Yönetimi'
                          : activeSection === 'product-create'
                            ? 'Yeni Ürün Oluştur'
                          : activeSection === 'analytics'
                            ? 'Analiz Merkezi'
                            : 'Yeni Cari'
                }}</strong>
              </p>
            </div>
            <div class="top-actions">
              <label>⌕<input v-model="search" placeholder="Bayi, sipariş veya ürün ara..." /></label
              ><div v-if="['overview', 'product-create'].includes(activeSection) && exchangeRates.usd && exchangeRates.eur" :class="['top-live-rates', { stale: exchangeRates.stale }]">
                <span><small>USD</small><strong>₺{{ Number(exchangeRates.usd).toLocaleString('tr-TR', { minimumFractionDigits: 4 }) }}</strong></span>
                <i></i><span><small>EUR</small><strong>₺{{ Number(exchangeRates.eur).toLocaleString('tr-TR', { minimumFractionDigits: 4 }) }}</strong></span>
                <em>{{ exchangeRates.source }}</em>
              </div
              ><button title="Verileri yenile" @click="refreshData">↻</button>
            </div>
          </header>
          <div class="dashboard-content">
            <div class="welcome-row">
              <div>
                <span>BUGÜNÜN ÖZETİ</span>
                <h1>İşletmeniz tek bakışta.</h1>
                <p>Satışları, siparişleri ve bayi hareketlerini buradan takip edin.</p>
              </div>
            </div>
            <div v-if="activeSection === 'overview'" class="dashboard-overview">
              <div class="metric-grid">
                <article class="metric blue">
                  <div class="metric-icon">♙</div>
                  <p>
                    <span>Kayıtlı Bayi</span><strong>{{ dealers.length }}</strong
                    ><small>Toplam aktif hesap</small>
                  </p>
                  <b>↗</b>
                </article>
                <article class="metric violet">
                  <div class="metric-icon">▤</div>
                  <p>
                    <span>Toplam Sipariş</span><strong>{{ orders.length }}</strong
                    ><small>{{ totalItems }} ürün satıldı</small>
                  </p>
                  <b>↗</b>
                </article>
                <article class="metric green">
                  <div class="metric-icon">₺</div>
                  <p>
                    <span>Toplam Satış</span><strong>{{ money(totalSales) }}</strong
                    ><small>Tüm zamanlar</small>
                  </p>
                  <b>↗</b>
                </article>
                <article class="metric orange">
                  <div class="metric-icon">◷</div>
                  <p>
                    <span>Bekleyen İşlem</span
                    ><strong>{{ orders.filter((o) => o.status.includes('Hazır')).length }}</strong
                    ><small>Hazırlanan sipariş</small>
                  </p>
                  <b>→</b>
                </article>
              </div>
              <div class="overview-grid">
                <section class="modern-card">
                  <div class="card-heading">
                    <div>
                      <span>SON SİPARİŞLER</span>
                      <h2>Kim ne aldı?</h2>
                    </div>
                    <button @click="activeSection = 'orders'">Tümünü gör →</button>
                  </div>
                  <div v-if="orders.length" class="compact-orders">
                    <article v-for="order in orders.slice(0, 5)" :key="order.id">
                      <span class="company-avatar">{{ order.dealer.company.charAt(0) }}</span>
                      <div>
                        <strong>{{ order.dealer.company }}</strong
                        ><small>{{
                          order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')
                        }}</small>
                      </div>
                      <strong>{{ money(order.total_try) }}</strong
                      ><em>{{ order.status }}</em>
                    </article>
                  </div>
                  <div v-else class="smart-empty">
                    <div>▤</div>
                    <h3>İlk siparişinizi bekliyoruz</h3>
                    <p>Bayi panelinden verilen siparişler burada anında görünecek.</p>
                    <a href="/">Bayi panelini aç →</a>
                  </div>
                </section>
                <aside class="activity-card">
                  <span>HIZLI İŞLEMLER</span>
                  <h2>Ne yapmak istersiniz?</h2>
                  <button @click="activeSection = 'dealers'">
                    <i>♙</i>
                    <p>
                      <strong>Bayileri görüntüle</strong><small>Kayıtlı hesapları incele</small>
                    </p>
                    <b>→</b></button
                  ><button @click="activeSection = 'orders'">
                    <i>▤</i>
                    <p>
                      <strong>Siparişleri yönet</strong
                      ><small>Ürün, durum ve PDF çıktısını gör</small>
                    </p>
                    <b>→</b>
                  </button>
                </aside>
              </div>
            </div>
            <section v-else-if="activeSection === 'orders'" class="orders-workspace">
              <div class="orders-hero"><div><span>SİPARİŞ OPERASYONU</span><h2>Siparişleri yönetin</h2><p>Satış hareketlerini inceleyin, ürün detaylarını açın ve belgeleri hazırlayın.</p></div><button class="export-orders" @click="exportOrders">↓ PDF indir</button></div>
              <div class="order-metrics"><article><span>Toplam sipariş</span><strong>{{ visibleOrders.length }}</strong><small>Filtrelenen kayıt</small></article><article><span>Ürün adedi</span><strong>{{ visibleOrderItems }}</strong><small>Siparişlerdeki toplam</small></article><article><span>Satış tutarı</span><strong>{{ money(visibleOrderSales) }}</strong><small>Filtrelenen ciro</small></article><article class="pending"><span>Aktif operasyon</span><strong>{{ orders.filter(order => !['Tamamlandı', 'İptal', 'Silindi'].includes(order.status)).length }}</strong><small>İşlem bekleyen sipariş</small></article></div>
              <div class="orders-toolbar"><label>⌕<input v-model="search" placeholder="Sipariş no, bayi veya ürün ara..." /></label><div class="filter-pills"><button v-for="filter in orderFilters" :key="filter" :class="{ active: orderFilter === filter }" @click="orderFilter = filter">{{ filter }}</button></div><button title="Siparişleri yenile" class="orders-refresh" @click="refreshData">↻ Yenile</button></div>
              <div class="orders-date-toolbar"><div class="date-pills"><button v-for="filter in dateFilters" :key="filter" :class="{ active: dateFilter === filter }" @click="dateFilter = filter">{{ filter }}</button></div><div v-if="dateFilter === 'Tarih Aralığı'" class="date-range"><label>Başlangıç<input v-model="dateFrom" type="date" /></label><span>→</span><label>Bitiş<input v-model="dateTo" type="date" /></label></div><span class="date-result">{{ visibleOrders.length }} sipariş gösteriliyor</span></div>
              <div v-if="visibleOrders.length" class="advanced-order-list">
                <article v-for="order in visibleOrders" :key="order.id" :class="{ expanded: expandedOrderId === order.id }">
                  <div class="order-main"><span class="order-avatar">{{ order.dealer.company.charAt(0).toUpperCase() }}</span><div class="order-identity"><small>SİPARİŞ NO</small><strong>#{{ order.order_number }}</strong><span>{{ order.dealer.company }} · {{ order.dealer.official }}</span></div><div class="order-product-preview"><small>ÜRÜNLER</small><strong>{{ order.items.reduce((sum, item) => sum + item.quantity, 0) }} ürün</strong><span>{{ cleanText(order.items[0]?.name || '') }}<template v-if="order.items.length > 1"> +{{ order.items.length - 1 }} kalem</template></span></div><div class="order-date"><small>TARİH</small><strong>{{ date(order.created_at) }}</strong></div><div class="order-amount"><small>TOPLAM</small><strong>{{ money(order.total_try) }}</strong></div><label :class="['order-status-control', statusClass(order.status)]"><small>DURUM</small><select v-model="order.status" :disabled="savingOrderStatusId === order.id" @change="updateOrderStatus(order)"><option v-for="status in orderStatuses" :key="status">{{ status }}</option></select></label><div class="order-actions"><button @click="expandedOrderId = expandedOrderId === order.id ? null : order.id">{{ expandedOrderId === order.id ? 'Kapat' : 'Detay' }}</button><button class="pdf-button" @click="printOrder(order)">▣ PDF</button><button v-if="order.status === 'Tamamlandı'" class="archive-order" @click="archiveOrder(order)">Sil</button></div></div>
                  <div v-if="expandedOrderId === order.id" class="order-details"><header><strong>Sipariş içeriği</strong><span>{{ order.items.length }} farklı kalem</span></header><div v-for="item in order.items" :key="item.name" class="order-detail-row"><span>{{ item.quantity }}×</span><strong>{{ cleanText(item.name) }}</strong><small>{{ money(item.unit_price_try) }} / adet</small><b>{{ money(Number(item.unit_price_try) * item.quantity) }}</b></div><section class="shipping-editor"><div><span>🚚</span><p><strong>Kargo ve takip</strong><small>Bilgiler kaydedildiğinde sipariş Kargoda durumuna geçer.</small></p></div><label>Kargo firması<input v-model.trim="order.shipping_company" list="shipping-companies" placeholder="Firma seçin" /></label><label>Takip numarası<input v-model.trim="order.tracking_number" placeholder="Takip numarasını girin" /></label><button :disabled="savingShippingId === order.id" @click="saveShipping(order)">{{ savingShippingId === order.id ? 'Kaydediliyor…' : 'Kargoya ver' }}</button><datalist id="shipping-companies"><option>Yurtiçi Kargo</option><option>Aras Kargo</option><option>MNG Kargo</option><option>Sürat Kargo</option><option>PTT Kargo</option><option>Hepsijet</option><option>Trendyol Express</option></datalist></section><footer v-if="order.shipping_address || order.note"><div v-if="order.shipping_address"><span>TESLİMAT ADRESİ</span><p>{{ order.shipping_address }}</p></div><div v-if="order.note"><span>SİPARİŞ NOTU</span><p>{{ order.note }}</p></div></footer></div>
                </article>
              </div>
              <div v-else class="smart-empty order-empty"><div>▤</div><h3>Sipariş bulunamadı</h3><p>Arama metnini, durum veya tarih filtresini değiştirerek tekrar deneyin.</p><button @click="search = ''; orderFilter = 'Tümü'; dateFilter = 'Tümü'; dateFrom = ''; dateTo = ''">Filtreleri temizle</button></div>
            </section>
            <section v-else class="modern-card full-card">
              <div class="card-heading">
                <div>
                  <span>CARİLER</span>
                  <h2>Kayıtlı cariler ve özel indirimler</h2>
                </div>
                <b>{{ dealers.length }} cari</b>
              </div>
              <p v-if="error" class="manager-error">{{ error }}</p>
              <p v-if="success" class="manager-success">✓ {{ success }}</p>
              <div v-if="dealers.length" class="dealer-table">
                <div class="head">
                  <span>Firma</span><span>Yetkili</span><span>İletişim</span><span>Şehir</span
                  ><span>Durum</span><span>Özel indirim</span><span>Kayıt tarihi</span><span>İşlem</span>
                </div>
                <div v-for="dealer in dealers" :key="dealer.id">
                  <strong>{{ dealer.company }}</strong
                  ><span>{{ dealer.official }}</span
                  ><span
                    >{{ dealer.email }}<small>{{ dealer.phone }}</small></span
                  ><span>{{ dealer.city }}</span
                  ><span><button
                    :class="['approval-button', { approved: dealer.is_approved }]"
                    @click="setDealerApproval(dealer, !dealer.is_approved)"
                  >{{ dealer.is_approved ? 'Onaylı · Pasifleştir' : 'Bekliyor · Onayla' }}</button></span
                  ><span class="discount-editor"
                    ><input
                      v-model="dealer.discount_percent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                    /><button @click="saveDealerDiscount(dealer)">Kaydet</button></span
                  ><span>{{ date(dealer.created_at) }}</span
                  ><button
                    class="delete-dealer"
                    :disabled="deletingDealerId === dealer.id"
                    @click="deleteDealer(dealer)"
                  >
                    {{ deletingDealerId === dealer.id ? 'Siliniyor…' : 'Sil' }}
                  </button>
                </div>
              </div>
              <div v-else class="smart-empty">
                <div>♙</div>
                <h3>Henüz kayıtlı cari yok</h3>
                <p>
                  Yeni cari kayıtları tamamlandığında firma, iletişim ve indirim bilgileri burada
                  listelenecek.
                </p>
                <a href="/">Kayıt sayfasını aç →</a>
              </div>
            </section>
          </div>
        </section>
        <div v-if="activeSection === 'products' || activeSection === 'product-create'" class="admin-overlay product-page">
          <section class="admin-manager product-manager">
            <button class="manager-close" @click="activeSection = activeSection === 'product-create' ? 'products' : 'overview'">×</button>
            <div class="card-heading">
              <div>
                <span>{{ activeSection === 'product-create' ? 'YENİ ÜRÜN' : 'ÜRÜN YÖNETİMİ' }}</span>
                <h2>{{ activeSection === 'product-create' ? 'Yeni ürün oluştur' : 'Ürün kataloğu ve fiyat merkezi' }}</h2>
                <p>
                  Ürünleri, üç para birimindeki fiyatları ve stok durumlarını tek yerden yönetin.
                </p>
              </div>
              <b>{{ products.length }} ürün</b>
            </div>
            <div v-if="activeSection === 'products'" class="product-metrics">
              <article>
                <span>Toplam ürün</span><strong>{{ products.length }}</strong>
              </article>
              <article>
                <span>Fiyatı tanımlı</span><strong>{{ pricedProductCount }}</strong>
              </article>
              <article>
                <span>Kritik stok</span
                ><strong>{{ products.filter((p) => p.stock > 0 && p.stock <= 2).length }}</strong>
              </article>
              <article class="danger">
                <span>Stokta yok</span
                ><strong>{{ products.filter((p) => p.stock === 0).length }}</strong>
              </article>
            </div>
            <div v-if="activeSection === 'product-create'" class="new-product-panel">
              <form class="advanced-product-form" @submit.prevent="addProduct">
                <section class="form-section product-basics">
                  <header><span>1</span><div><strong>Temel bilgiler</strong><small>Ürünün katalogda görünen bilgileri</small></div></header>
                  <div>
                    <label>Ürün adı<input v-model="productForm.name" required maxlength="300" placeholder="Örn. NDF 307 Çapa Makinası" /><small>{{ productForm.name.length }}/300 karakter</small></label>
                    <label>Kategori<input v-model="productForm.category" required list="product-categories" placeholder="Kategori seçin veya yazın" /><datalist id="product-categories"><option v-for="category in categorySuggestions" :key="category" :value="category" /></datalist><small>{{ categorySuggestions.length }} mevcut kategori</small></label>
                    <label>Stok miktarı<input v-model.number="productForm.stock" type="number" min="0" required /><small>Satışa hazır ürün adedi</small></label>
                  </div>
                </section>
                <section class="form-section price-section">
                  <header><span>2</span><div><strong>Fiyatlandırma</strong><small>Bir veya birden fazla para biriminde fiyat tanımlayın</small></div></header>
                  <div class="price-cards">
                    <label :class="{ selected: productForm.default_currency === 'TRY' }"><button type="button" @click="selectDefaultCurrency('TRY')">{{ productForm.default_currency === 'TRY' ? '✓ Varsayılan' : 'Varsayılan yap' }}</button><span>₺</span><strong>Türk Lirası</strong><input v-model.number="productForm.price_try" type="number" min="0" step="0.01" placeholder="0,00" /><small>TL satış fiyatı</small></label>
                    <label :class="{ selected: productForm.default_currency === 'USD' }"><button type="button" @click="selectDefaultCurrency('USD')">{{ productForm.default_currency === 'USD' ? '✓ Varsayılan' : 'Varsayılan yap' }}</button><span>$</span><strong>Amerikan Doları</strong><input v-model.number="productForm.price_usd" type="number" min="0" step="0.01" placeholder="0.00" /><small>USD satış fiyatı</small></label>
                    <label :class="{ selected: productForm.default_currency === 'EUR' }"><button type="button" @click="selectDefaultCurrency('EUR')">{{ productForm.default_currency === 'EUR' ? '✓ Varsayılan' : 'Varsayılan yap' }}</button><span>€</span><strong>Euro</strong><input v-model.number="productForm.price_eur" type="number" min="0" step="0.01" placeholder="0,00" /><small>EUR satış fiyatı</small></label>
                  </div>
                  <p v-if="defaultPriceMissing" class="price-warning">Seçilen varsayılan para birimi için fiyat girin.</p>
                </section>
                <section class="form-section media-section">
                  <header><span>3</span><div><strong>Ürün görseli</strong><small>JPG, PNG veya WebP · En fazla 5 MB</small></div></header>
                  <label class="image-drop"><input type="file" accept="image/*" @change="handleProductImage" /><img v-if="productImagePreview" :src="productImagePreview" alt="Ürün önizleme" /><span v-else>▧</span><div><strong>{{ productImage?.name || 'Fotoğraf seçin' }}</strong><small>{{ productImage ? 'Değiştirmek için tekrar tıklayın' : 'Dosya seçmek için tıklayın' }}</small></div></label>
                </section>
                <footer class="product-form-footer"><div><span>Varsayılan fiyat</span><strong>{{ currencyName(productForm.default_currency) }}</strong><small>{{ productImage ? 'Görsel hazır' : 'Görsel isteğe bağlı' }}</small></div><button :disabled="defaultPriceMissing">＋ Ürünü Kataloğa Ekle</button></footer>
              </form>
            </div>
            <p v-if="error" class="manager-error">{{ error }}</p>
            <p v-if="success" class="manager-success">✓ {{ success }}</p>
            <div v-if="activeSection === 'products'" class="product-list-toolbar">
              <label
                >⌕<input v-model="productSearch" placeholder="Ürün adı veya kategori ara..."
              /></label>
              <div>
                <button
                  v-for="filter in [
                    { key: 'all', label: 'Tümü' },
                    { key: 'available', label: 'Stokta' },
                    { key: 'low', label: 'Kritik' },
                    { key: 'out', label: 'Tükendi' },
                  ]"
                  :key="filter.key"
                  :class="{ active: productStockFilter === filter.key }"
                  @click="productStockFilter = filter.key as typeof productStockFilter"
                >
                  {{ filter.label }}
                </button>
              </div>
              <span>{{ visibleProducts.length }} sonuç</span>
            </div>
            <div v-if="activeSection === 'products'" class="product-admin-list multi-price-list">
              <article v-for="product in visibleProducts" :key="product.id">
                <img
                  :src="product.image_url || 'https://placehold.co/90x90?text=NDF'"
                  :alt="product.name"
                />
                <div>
                  <strong>{{ product.name }}</strong
                  ><small>{{ product.category }}</small
                  ><span class="default-price-chip"
                    >{{ currencyName(product.default_currency) }} varsayılan</span
                  >
                </div>
                <label
                  >TL<input
                    v-model="product.price_try"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Tanımsız" /></label
                ><label
                  >USD<input
                    v-model="product.price_usd"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Tanımsız" /></label
                ><label
                  >EUR<input
                    v-model="product.price_eur"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Tanımsız" /></label
                ><label
                  >Varsayılan<select v-model="product.default_currency">
                    <option value="TRY">TL</option>
                    <option value="USD">Dolar</option>
                    <option value="EUR">Euro</option>
                  </select></label
                ><label>Stok<input v-model.number="product.stock" type="number" min="0" /></label
                ><em
                  :class="{
                    out: product.stock === 0,
                    low: product.stock > 0 && product.stock <= 2,
                  }"
                  >{{
                    product.stock === 0
                      ? 'Stok bitti'
                      : product.stock <= 2
                        ? 'Kritik stok'
                        : 'Stokta'
                  }}</em
                ><div class="product-row-actions"><button :disabled="savingProductId === product.id" @click="saveProduct(product)">
                  {{ savingProductId === product.id ? 'Kaydediliyor…' : 'Kaydet' }}
                </button><button class="delete-product" :disabled="deletingProductId === product.id" @click="deleteProduct(product)">{{ deletingProductId === product.id ? 'Siliniyor…' : 'Sil' }}</button></div>
              </article>
              <div v-if="!visibleProducts.length" class="product-empty">
                <span>⌕</span><strong>Ürün bulunamadı</strong
                ><small>Arama veya stok filtresini değiştirin.</small>
              </div>
            </div>
          </section>
        </div>
        <div v-if="activeSection === 'analytics'" class="admin-overlay">
          <section class="admin-manager">
            <button class="manager-close" @click="activeSection = 'overview'">×</button>
            <div class="card-heading">
              <div>
                <span>ANALİZ</span>
                <h2>Satış ve stok analizi</h2>
              </div>
            </div>
            <div class="analytics-grid">
              <article>
                <span>Toplam Ciro</span><strong>{{ money(totalSales) }}</strong>
              </article>
              <article>
                <span>Satılan Ürün</span><strong>{{ totalItems }}</strong>
              </article>
              <article>
                <span>Stok Biten</span
                ><strong>{{ products.filter((p) => p.stock === 0).length }}</strong>
              </article>
              <article>
                <span>Kritik Stok</span
                ><strong>{{ products.filter((p) => p.stock > 0 && p.stock <= 2).length }}</strong>
              </article>
            </div>
            <h3>Stok uyarıları</h3>
            <div
              class="stock-alert"
              v-for="product in products.filter((p) => p.stock <= 2).slice(0, 20)"
              :key="product.id"
            >
              <strong>{{ product.name }}</strong
              ><span>{{ product.stock }} adet</span>
            </div>
          </section>
        </div>
        <div v-if="activeSection === 'dealer-create'" class="admin-overlay">
          <section class="admin-manager dealer-manager">
            <button class="manager-close" @click="activeSection = 'overview'">×</button>
            <div class="card-heading">
              <div>
                <span>CARİ YÖNETİMİ</span>
                <h2>Yeni cari hesabı oluştur</h2>
              </div>
            </div>
            <form class="dealer-form" @submit.prevent="addDealer">
              <label
                >Firma unvanı<input v-model="dealerForm.company" required minlength="2" /></label
              ><label
                >Yetkili kişi<input v-model="dealerForm.official" required minlength="2" /></label
              ><label
                >Vergi numarası<input
                  v-model="dealerForm.tax_number"
                  required
                  pattern="\d{10,11}" /></label
              ><label>Şehir<input v-model="dealerForm.city" required /></label
              ><label>Telefon<input v-model="dealerForm.phone" required /></label
              ><label>E-posta<input v-model="dealerForm.email" required type="email" /></label
              ><label
                >Geçici şifre<input v-model="dealerForm.password" required minlength="8" /></label
              ><button>＋ Cari Hesabı Oluştur</button>
            </form>
            <p v-if="error" class="manager-error">{{ error }}</p>
          </section>
        </div>
      </div>
    </template>
    <template v-if="false">
      <header>
        <div><b>NDF</b><span>Yönetim Paneli</span></div>
        <a href="/">Bayi sitesine dön</a>
      </header>
      <section class="admin-content">
        <div class="admin-title">
          <div>
            <span>GENEL BAKIŞ</span>
            <h1>Satış ve Bayi Yönetimi</h1>
          </div>
          <input v-model="search" placeholder="Bayi, sipariş veya ürün ara…" />
        </div>
        <div class="admin-stats">
          <article>
            <span>Kayıtlı bayi</span><strong>{{ dealers.length }}</strong>
          </article>
          <article>
            <span>Toplam sipariş</span><strong>{{ orders.length }}</strong>
          </article>
          <article>
            <span>Toplam satış</span
            ><strong>{{ money(orders.reduce((sum, o) => sum + Number(o.total_try), 0)) }}</strong>
          </article>
        </div>
        <section class="admin-card">
          <h2>Kim ne aldı?</h2>
          <div class="order-list">
            <article v-for="order in visibleOrders" :key="order.id">
              <div>
                <strong>{{ order.dealer.company }}</strong
                ><small>{{ order.dealer.official }} · {{ order.dealer.phone }}</small>
              </div>
              <div class="items">
                <span v-for="item in order.items" :key="item.name"
                  >{{ item.quantity }}× {{ item.name }}</span
                ><small v-if="order.note">Not: {{ order.note }}</small>
              </div>
              <div>
                <strong>{{ money(order.total_try) }}</strong
                ><small>{{ date(order.created_at) }}</small>
              </div>
              <em>{{ order.status }}</em>
            </article>
            <p v-if="!visibleOrders.length">Sipariş bulunamadı.</p>
          </div>
        </section>
        <section class="admin-card">
          <h2>Kim kayıt oldu?</h2>
          <div class="dealer-table">
            <div class="head">
              <span>Firma</span><span>Yetkili</span><span>İletişim</span><span>Şehir</span
              ><span>Kayıt tarihi</span>
            </div>
            <div v-for="dealer in dealers" :key="dealer.id">
              <strong>{{ dealer.company }}</strong
              ><span>{{ dealer.official }}</span
              ><span
                >{{ dealer.email }}<small>{{ dealer.phone }}</small></span
              ><span>{{ dealer.city }}</span
              ><span>{{ date(dealer.created_at) }}</span>
            </div>
          </div>
        </section>
      </section>
    </template>
    <footer v-if="!authenticated" class="admin-creator-credit">Created by Raul Babakhanov</footer>
  </main>
</template>

<style scoped>
* {
  box-sizing: border-box;
}
.admin-shell {
  min-height: 100vh;
  background: #f3f6fb;
  color: #142b55;
  font-family: Inter, Arial, sans-serif;
}
.admin-login {
  width: min(430px, calc(100% - 32px));
  margin: 10vh auto;
  padding: 42px;
  border: 1px solid #dce4f0;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 25px 70px #17366b1c;
}
.admin-mark {
  display: grid;
  place-items: center;
  width: 70px;
  height: 48px;
  border-radius: 10px;
  background: #173f87;
  color: #fff;
  font-size: 23px;
  font-weight: 900;
  letter-spacing: 3px;
}
.admin-login > span,
.admin-title span {
  display: block;
  margin-top: 25px;
  color: #2870c9;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 2px;
}
.admin-login h1 {
  margin: 8px 0;
}
.admin-login p {
  color: #738099;
  line-height: 1.6;
}
.admin-login form {
  display: flex;
  gap: 10px;
  margin-top: 25px;
}
.admin-login input,
.admin-title input {
  flex: 1;
  padding: 14px;
  border: 1px solid #ced9e9;
  border-radius: 10px;
}
.admin-login button {
  padding: 0 20px;
  border: 0;
  border-radius: 10px;
  background: #2356a6;
  color: #fff;
  font-weight: 800;
}
.admin-login em {
  display: block;
  margin-top: 15px;
  color: #bb3344;
  font-style: normal;
}
header {
  height: 72px;
  padding: 0 5%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #102e66;
  color: #fff;
}
header div {
  display: flex;
  align-items: center;
  gap: 15px;
}
header b {
  font-size: 23px;
  letter-spacing: 3px;
}
header a {
  color: #d9e7ff;
  text-decoration: none;
}
.admin-content {
  max-width: 1380px;
  margin: auto;
  padding: 42px;
}
.admin-title {
  display: flex;
  align-items: end;
  justify-content: space-between;
}
.admin-title h1 {
  margin: 7px 0 0;
}
.admin-title input {
  max-width: 350px;
}
.admin-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin: 28px 0;
}
.admin-stats article,
.admin-card {
  padding: 24px;
  border: 1px solid #dfe6f0;
  border-radius: 16px;
  background: #fff;
}
.admin-stats span {
  display: block;
  color: #7b879b;
  font-size: 12px;
}
.admin-stats strong {
  display: block;
  margin-top: 10px;
  font-size: 27px;
}
.admin-card {
  margin-bottom: 22px;
}
.admin-card h2 {
  margin-top: 0;
}
.order-list article {
  display: grid;
  grid-template-columns: 1fr 2fr 0.7fr auto;
  gap: 20px;
  align-items: center;
  padding: 17px 0;
  border-top: 1px solid #edf0f5;
}
.order-list div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.order-list small {
  color: #7d899b;
}
.order-list em {
  padding: 7px 10px;
  border-radius: 20px;
  background: #fff2d7;
  color: #a96e12;
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
}
.dealer-table > div {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1.6fr 0.7fr 1fr;
  gap: 16px;
  padding: 15px;
  border-top: 1px solid #edf0f5;
}
.dealer-table .head {
  color: #8691a3;
  font-size: 10px;
  font-weight: 800;
}
.dealer-table span {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
.dealer-table small {
  color: #8994a6;
}
@media (max-width: 800px) {
  .admin-content {
    padding: 22px;
  }
  .admin-title {
    display: block;
  }
  .admin-title input {
    width: 100%;
    max-width: none;
    margin-top: 18px;
  }
  .admin-stats {
    grid-template-columns: 1fr;
  }
  .order-list article {
    grid-template-columns: 1fr;
  }
  .dealer-table {
    overflow: auto;
  }
  .dealer-table > div {
    min-width: 800px;
  }
}
.admin-shell:has(.admin-login) {
  display: grid;
  place-items: center;
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 18% 18%, #2c6bd933 0, transparent 27%),
    radial-gradient(circle at 85% 78%, #20b9d529 0, transparent 24%),
    linear-gradient(135deg, #071b3c 0%, #0c2e66 50%, #164a91 100%);
}
.admin-shell:has(.admin-login)::before,
.admin-shell:has(.admin-login)::after {
  content: '';
  position: absolute;
  border: 1px solid #ffffff12;
  border-radius: 50%;
}
.admin-shell:has(.admin-login)::before {
  width: 600px;
  height: 600px;
  left: -250px;
  bottom: -350px;
  box-shadow:
    0 0 0 70px #ffffff05,
    0 0 0 140px #ffffff03;
}
.admin-shell:has(.admin-login)::after {
  width: 450px;
  height: 450px;
  right: -190px;
  top: -240px;
  box-shadow: 0 0 0 65px #ffffff05;
}
.admin-login {
  position: relative;
  z-index: 1;
  width: min(480px, calc(100% - 32px));
  margin: 32px;
  padding: 46px;
  border: 1px solid #ffffff8c;
  border-radius: 28px;
  background: #fffffff5;
  box-shadow: 0 35px 100px #020c215e;
  backdrop-filter: blur(18px);
}
.login-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 38px;
}
.login-brand .admin-mark {
  width: 60px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #123875, #2870ce);
  box-shadow: 0 10px 24px #17498e38;
}
.login-brand > div:last-child {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.login-brand strong {
  font-size: 15px;
}
.login-brand small {
  color: #8591a5;
  font-size: 10px;
}
.admin-login > span {
  margin: 0;
  color: #2670cc;
  font-size: 9px;
  letter-spacing: 2.2px;
}
.admin-login h1 {
  margin: 10px 0 9px;
  font-size: 30px;
  letter-spacing: -0.7px;
}
.admin-login p {
  margin: 0;
  font-size: 13px;
}
.admin-login form {
  display: block;
  margin-top: 30px;
}
.admin-login form > label {
  display: block;
  margin-bottom: 9px;
  color: #273d61;
  font-size: 11px;
  font-weight: 800;
}
.password-field {
  height: 52px;
  display: flex;
  align-items: center;
  border: 1px solid #cad6e7;
  border-radius: 12px;
  background: #f8faff;
  transition: 0.2s;
}
.password-field:focus-within {
  border-color: #2a6dcc;
  background: #fff;
  box-shadow: 0 0 0 4px #2b70cb16;
}
.password-field > span {
  padding-left: 16px;
  color: #7c8ca6;
  font-size: 20px;
}
.admin-login .password-field input {
  width: 100%;
  height: 100%;
  padding: 0 14px;
  border: 0;
  outline: 0;
  background: transparent;
}
.admin-login form > button {
  width: 100%;
  height: 52px;
  margin-top: 14px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 12px;
  background: linear-gradient(100deg, #17458f, #2872d0);
  box-shadow: 0 12px 25px #1c58a93b;
  cursor: pointer;
  transition: 0.2s;
}
.admin-login form > button:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 30px #1c58a950;
}
.admin-login form > button b {
  font-size: 20px;
}
.admin-login em {
  padding: 11px 13px;
  border-radius: 9px;
  background: #fff0f1;
  font-size: 11px;
}
.admin-login footer {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #e7ebf2;
  color: #8a95a7;
  text-align: center;
  font-size: 10px;
}
.admin-login footer span {
  margin-right: 5px;
}
@media (max-width: 520px) {
  .admin-login {
    margin: 16px;
    padding: 30px 24px;
    border-radius: 22px;
  }
  .login-brand {
    margin-bottom: 30px;
  }
  .admin-login h1 {
    font-size: 26px;
  }
}
.admin-shell:has(.admin-login) {
  padding: 36px;
  background:
    radial-gradient(circle at 8% 20%, #3479dc28, transparent 30%),
    radial-gradient(circle at 92% 82%, #18a8d522, transparent 28%),
    linear-gradient(135deg, #061a3b, #0b2d64 52%, #12488e);
}
.admin-login {
  width: min(1120px, 100%);
  min-height: 650px;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  overflow: hidden;
  border-radius: 32px;
  background: #fff;
}
.brand-panel {
  position: relative;
  overflow: hidden;
  padding: 58px;
  display: flex;
  flex-direction: column;
  background: linear-gradient(145deg, #0a2b63, #154d99 62%, #2478c7);
  color: #fff;
}
.brand-panel::before {
  content: '';
  position: absolute;
  width: 440px;
  height: 440px;
  right: -230px;
  top: -210px;
  border: 1px solid #ffffff25;
  border-radius: 50%;
  box-shadow:
    0 0 0 65px #ffffff0b,
    0 0 0 130px #ffffff08;
}
.brand-panel::after {
  content: '';
  position: absolute;
  width: 280px;
  height: 280px;
  left: -190px;
  bottom: -190px;
  border: 1px solid #ffffff1c;
  border-radius: 50%;
  box-shadow: 0 0 0 50px #ffffff08;
}
.brand-logo {
  position: relative;
  z-index: 1;
  width: max-content;
  padding: 13px 17px;
  border: 1px solid #ffffff38;
  border-radius: 13px;
  background: #ffffff14;
  box-shadow: 0 12px 30px #03132e32;
  font-size: 35px;
  font-weight: 950;
  letter-spacing: 7px;
}
.brand-copy {
  position: relative;
  z-index: 1;
  margin: auto 0 45px;
}
.brand-copy > span {
  color: #85c8ff;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 3px;
}
.brand-copy h2 {
  max-width: 470px;
  margin: 18px 0;
  font-size: 46px;
  line-height: 1.08;
  letter-spacing: -1.5px;
}
.brand-copy p {
  max-width: 440px;
  margin: 0;
  color: #d2e6ff;
  font-size: 17px;
  line-height: 1.7;
}
.brand-features {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 12px;
}
.brand-features > div {
  padding: 12px 0;
  display: flex;
  align-items: center;
  gap: 16px;
  border-top: 1px solid #ffffff20;
}
.brand-features b {
  color: #78c7ff;
  font-size: 12px;
}
.brand-features span {
  font-size: 14px;
  font-weight: 700;
}
.brand-panel > small {
  position: relative;
  z-index: 1;
  margin-top: 34px;
  color: #a9c9ee;
  font-size: 11px;
}
.login-form-panel {
  padding: 64px 62px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.login-form-panel .login-brand {
  margin-bottom: 45px;
}
.login-form-panel .login-brand .admin-mark {
  width: 67px;
  height: 53px;
  font-size: 25px;
}
.login-form-panel .login-brand strong {
  font-size: 17px;
}
.login-form-panel .login-brand small {
  font-size: 11px;
}
.login-form-panel > span {
  color: #2670cc;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 2.5px;
}
.login-form-panel h1 {
  margin: 13px 0 11px;
  font-size: 38px;
  line-height: 1.1;
}
.login-form-panel > p {
  font-size: 15px;
}
.login-form-panel form {
  margin-top: 36px;
}
.login-form-panel form > label {
  font-size: 13px;
}
.login-form-panel .password-field {
  height: 59px;
}
.login-form-panel .password-field input {
  font-size: 15px;
}
.login-form-panel form > button {
  height: 58px;
  font-size: 14px;
}
.login-form-panel > em {
  font-size: 12px;
}
.login-form-panel footer {
  font-size: 11px;
}
@media (max-width: 900px) {
  .admin-shell:has(.admin-login) {
    padding: 20px;
  }
  .admin-login {
    grid-template-columns: 1fr;
    max-width: 570px;
  }
  .brand-panel {
    min-height: 280px;
    padding: 34px;
  }
  .brand-copy {
    margin: 45px 0 20px;
  }
  .brand-copy h2 {
    font-size: 31px;
  }
  .brand-copy p {
    font-size: 14px;
  }
  .brand-features,
  .brand-panel > small {
    display: none;
  }
  .login-form-panel {
    padding: 42px 36px;
  }
}
@media (max-width: 520px) {
  .admin-shell:has(.admin-login) {
    padding: 0;
  }
  .admin-login {
    min-height: 100vh;
    border-radius: 0;
  }
  .brand-panel {
    min-height: 225px;
    padding: 26px;
  }
  .brand-logo {
    font-size: 26px;
  }
  .brand-copy {
    margin: 30px 0 0;
  }
  .brand-copy h2 {
    font-size: 27px;
  }
  .brand-copy p {
    display: none;
  }
  .login-form-panel {
    padding: 34px 25px;
  }
  .login-form-panel .login-brand {
    display: none;
  }
  .login-form-panel h1 {
    font-size: 31px;
  }
}
@media (min-width: 901px) {
  .admin-login {
    width: min(1240px, 100%);
    min-height: 710px;
    grid-template-columns: 1.08fr 0.92fr;
  }
  .brand-panel {
    padding: 68px;
  }
  .brand-logo {
    padding: 15px 20px;
    font-size: 40px;
    letter-spacing: 8px;
  }
  .brand-copy h2 {
    max-width: 510px;
    font-size: 52px;
  }
  .brand-copy p {
    max-width: 470px;
    font-size: 18px;
  }
  .brand-features span {
    font-size: 15px;
  }
  .login-form-panel {
    padding: 72px 70px;
  }
  .login-form-panel h1 {
    font-size: 43px;
  }
  .login-form-panel > p {
    font-size: 16px;
  }
  .login-form-panel .password-field,
  .login-form-panel form > button {
    height: 62px;
  }
}
.dashboard-layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 255px 1fr;
  background: #f5f7fb;
}
.dashboard-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 28px 20px 20px;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #092657, #0d3470);
  color: #fff;
}
.side-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 9px 30px;
}
.side-brand > b {
  padding: 10px;
  border: 1px solid #ffffff2b;
  border-radius: 10px;
  background: #ffffff12;
  font-size: 20px;
  letter-spacing: 4px;
}
.side-brand > span {
  display: flex;
  flex-direction: column;
}
.side-brand strong {
  font-size: 14px;
}
.side-brand small {
  margin-top: 3px;
  color: #8fb3e4;
  font-size: 9px;
}
.dashboard-sidebar nav {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.dashboard-sidebar nav > small {
  margin: 20px 12px 8px;
  color: #6f98cd;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 1.7px;
}
.dashboard-sidebar nav button,
.dashboard-sidebar nav a {
  min-height: 46px;
  padding: 0 13px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #b8cdea;
  text-decoration: none;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.dashboard-sidebar nav button > span {
  width: 22px;
  font-size: 18px;
}
.dashboard-sidebar nav button > b {
  margin-left: auto;
  padding: 4px 7px;
  border-radius: 10px;
  background: #ffffff13;
  font-size: 8px;
}
.dashboard-sidebar nav button:hover,
.dashboard-sidebar nav button.active,
.dashboard-sidebar nav a:hover {
  background: #ffffff12;
  color: #fff;
}
.dashboard-sidebar nav button.active {
  box-shadow: inset 3px 0 #55b8ff;
}
.side-user {
  margin-top: auto;
  padding: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #ffffff13;
  border-radius: 12px;
  background: #ffffff0a;
}
.side-user > span {
  display: grid;
  place-items: center;
  width: 35px;
  height: 35px;
  border-radius: 9px;
  background: #2873ca;
  font-weight: 900;
}
.side-user > div {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.side-user strong {
  font-size: 10px;
}
.side-user small {
  margin-top: 3px;
  color: #7fa3d3;
  font-size: 8px;
}
.side-user button {
  border: 0;
  background: none;
  color: #a9c2e4;
  cursor: pointer;
}
.dashboard-main {
  min-width: 0;
}
.dashboard-top {
  height: 78px;
  padding: 0 35px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e1e6ef;
  background: #fff;
  color: #142b55;
}
.dashboard-top > div,
.dashboard-top p {
  display: flex;
  align-items: center;
}
.dashboard-top p {
  flex-direction: column;
  align-items: flex-start;
  margin: 0;
}
.dashboard-top p small {
  color: #8c97a9;
  font-size: 8px;
  letter-spacing: 1.4px;
}
.dashboard-top p strong {
  margin-top: 4px;
  font-size: 15px;
}
.mobile-logo {
  display: none;
}
.top-actions {
  gap: 10px;
}
.top-actions label {
  width: 300px;
  height: 42px;
  padding: 0 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #dbe2ed;
  border-radius: 10px;
  background: #f8fafc;
  color: #8290a5;
}
.top-actions input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 11px;
}
.top-actions > button {
  height: 42px;
  padding: 0 14px;
  border: 1px solid #dbe2ed;
  border-radius: 10px;
  background: #fff;
  color: #53637c;
  font-weight: 700;
  cursor: pointer;
}
.top-actions .export-button {
  border-color: #2262b8;
  background: #2262b8;
  color: #fff;
}
.dashboard-content {
  max-width: 1500px;
  margin: auto;
  padding: 36px;
}
.welcome-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 25px;
}
.welcome-row > div > span,
.card-heading > div > span,
.activity-card > span {
  color: #2870c9;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 1.8px;
}
.welcome-row h1 {
  margin: 7px 0 5px;
  font-size: 27px;
}
.welcome-row p {
  margin: 0;
  color: #7c879a;
  font-size: 11px;
}
.live-chip {
  padding: 9px 12px;
  border: 1px solid #dce9e2;
  border-radius: 20px;
  background: #f1fbf5;
  color: #347c52;
  font-size: 9px;
  font-weight: 800;
}
.live-chip i {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: #35b86c;
  box-shadow: 0 0 0 4px #35b86c1d;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.metric {
  min-height: 126px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid #e0e6ef;
  border-radius: 15px;
  background: #fff;
  box-shadow: 0 7px 25px #172e6a08;
}
.metric-icon {
  display: grid;
  place-items: center;
  width: 45px;
  height: 45px;
  border-radius: 12px;
  font-size: 20px;
}
.metric.blue .metric-icon {
  background: #e8f1ff;
  color: #2865bc;
}
.metric.violet .metric-icon {
  background: #f0eaff;
  color: #7454bd;
}
.metric.green .metric-icon {
  background: #e6f8ee;
  color: #2b8b55;
}
.metric.orange .metric-icon {
  background: #fff0df;
  color: #c77923;
}
.metric p {
  display: flex;
  flex: 1;
  flex-direction: column;
  margin: 0;
}
.metric p > span {
  color: #7d899d;
  font-size: 9px;
}
.metric strong {
  margin: 5px 0;
  font-size: 20px;
}
.metric small {
  color: #a2abba;
  font-size: 8px;
}
.metric > b {
  align-self: flex-start;
  color: #9ba9bc;
}
.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.7fr);
  gap: 16px;
  margin-top: 16px;
}
.modern-card,
.activity-card {
  padding: 25px;
  border: 1px solid #e0e6ef;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 30px #172e6a08;
}
.card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.card-heading h2,
.activity-card h2 {
  margin: 5px 0 0;
  font-size: 18px;
}
.card-heading > button {
  border: 0;
  background: none;
  color: #2564b9;
  font-size: 9px;
  font-weight: 800;
  cursor: pointer;
}
.compact-orders article {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 12px;
  align-items: center;
  padding: 13px 0;
  border-top: 1px solid #edf0f4;
}
.company-avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: #eaf2ff;
  color: #2864b9;
  font-weight: 900;
}
.compact-orders article > div {
  display: flex;
  flex-direction: column;
}
.compact-orders small {
  margin-top: 4px;
  color: #8a95a7;
  font-size: 8px;
}
.compact-orders article > strong {
  font-size: 11px;
}
.compact-orders em {
  padding: 6px 8px;
  border-radius: 12px;
  background: #fff2d9;
  color: #a87019;
  font-size: 8px;
  font-style: normal;
  font-weight: 800;
}
.activity-card > button {
  width: 100%;
  padding: 13px 0;
  display: flex;
  align-items: center;
  gap: 11px;
  border: 0;
  border-top: 1px solid #edf0f4;
  background: none;
  text-align: left;
  cursor: pointer;
}
.activity-card button i {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: #eff4fb;
  color: #2864b9;
  font-style: normal;
}
.activity-card button p {
  display: flex;
  flex: 1;
  flex-direction: column;
  margin: 0;
}
.activity-card button strong {
  font-size: 10px;
}
.activity-card button small {
  margin-top: 4px;
  color: #929cad;
  font-size: 8px;
}
.activity-card button > b {
  color: #9aa7b8;
}
.smart-empty {
  min-height: 250px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
}
.smart-empty > div {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: 17px;
  background: #edf4ff;
  color: #2865bd;
  font-size: 26px;
}
.smart-empty h3 {
  margin: 15px 0 6px;
  font-size: 15px;
}
.smart-empty p {
  max-width: 330px;
  margin: 0;
  color: #8994a5;
  font-size: 10px;
  line-height: 1.6;
}
.smart-empty a {
  margin-top: 14px;
  color: #2865bd;
  font-size: 9px;
  font-weight: 800;
  text-decoration: none;
}
.full-card {
  min-height: 520px;
}
.filter-pills {
  display: flex;
  gap: 5px;
}
.filter-pills button {
  padding: 8px 11px;
  border: 0;
  border-radius: 8px;
  background: #f2f5f9;
  color: #79869a;
  font-size: 8px;
  font-weight: 800;
  cursor: pointer;
}
.filter-pills button.active {
  background: #e5efff;
  color: #2862b5;
}
@media (max-width: 1100px) {
  .metric-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .overview-grid {
    grid-template-columns: 1fr;
  }
  .top-actions label {
    width: 220px;
  }
}
@media (max-width: 760px) {
  .dashboard-layout {
    display: block;
  }
  .dashboard-sidebar {
    position: static;
    width: 100%;
    height: auto;
    padding: 14px 18px;
    flex-direction: row;
    align-items: center;
  }
  .side-brand {
    padding: 0;
    flex: 1;
  }
  .side-brand > span,
  .dashboard-sidebar nav > small,
  .side-user {
    display: none;
  }
  .dashboard-sidebar nav {
    flex-direction: row;
  }
  .dashboard-sidebar nav button {
    font-size: 0;
  }
  .dashboard-sidebar nav button > span {
    font-size: 18px;
  }
  .dashboard-top {
    padding: 0 18px;
  }
  .top-actions label,
  .export-button,
  .dashboard-top p {
    display: none;
  }
  .mobile-logo {
    display: block;
    font-weight: 900;
    letter-spacing: 3px;
  }
  .dashboard-content {
    padding: 24px 16px;
  }
  .metric-grid {
    grid-template-columns: 1fr;
  }
  .welcome-row p {
    display: none;
  }
  .overview-grid {
    display: block;
  }
  .activity-card {
    margin-top: 14px;
  }
  .order-list article {
    grid-template-columns: 1fr;
  }
  .dealer-table {
    overflow: auto;
  }
  .dealer-table > div {
    min-width: 800px;
  }
}
@media (min-width: 1101px) {
  .dashboard-layout {
    grid-template-columns: 300px 1fr;
  }
  .dashboard-sidebar {
    padding: 34px 24px 24px;
  }
  .side-brand > b {
    padding: 13px;
    font-size: 25px;
  }
  .side-brand strong {
    font-size: 18px;
  }
  .side-brand small {
    font-size: 12px;
  }
  .dashboard-sidebar nav > small {
    font-size: 11px;
  }
  .dashboard-sidebar nav button,
  .dashboard-sidebar nav a {
    min-height: 58px;
    font-size: 15px;
  }
  .dashboard-sidebar nav button > span {
    width: 27px;
    font-size: 22px;
  }
  .side-user {
    padding: 16px;
  }
  .side-user > span {
    width: 43px;
    height: 43px;
  }
  .side-user strong {
    font-size: 14px;
  }
  .side-user small {
    font-size: 11px;
  }
  .dashboard-top {
    height: 92px;
    padding: 0 44px;
  }
  .dashboard-top p small {
    font-size: 11px;
  }
  .dashboard-top p strong {
    font-size: 20px;
  }
  .top-actions label {
    width: 360px;
    height: 50px;
    font-size: 16px;
  }
  .top-actions input {
    font-size: 14px;
  }
  .top-actions > button {
    height: 50px;
    font-size: 14px;
  }
  .dashboard-content {
    max-width: 1600px;
    padding: 48px;
  }
  .welcome-row {
    margin-bottom: 34px;
  }
  .welcome-row > div > span,
  .card-heading > div > span,
  .activity-card > span {
    font-size: 11px;
  }
  .welcome-row h1 {
    margin-top: 10px;
    font-size: 38px;
  }
  .welcome-row p {
    font-size: 15px;
  }
  .live-chip {
    padding: 12px 16px;
    font-size: 12px;
  }
  .metric-grid {
    gap: 20px;
  }
  .metric {
    min-height: 165px;
    padding: 26px;
    gap: 18px;
    border-radius: 19px;
  }
  .metric-icon {
    width: 58px;
    height: 58px;
    border-radius: 15px;
    font-size: 26px;
  }
  .metric p > span {
    font-size: 13px;
  }
  .metric strong {
    margin: 8px 0;
    font-size: 29px;
  }
  .metric small {
    font-size: 11px;
  }
  .metric > b {
    font-size: 18px;
  }
  .overview-grid {
    gap: 22px;
    margin-top: 22px;
    grid-template-columns: minmax(0, 1.65fr) minmax(360px, 0.75fr);
  }
  .modern-card,
  .activity-card {
    padding: 32px;
    border-radius: 20px;
  }
  .card-heading {
    margin-bottom: 24px;
  }
  .card-heading h2,
  .activity-card h2 {
    font-size: 25px;
  }
  .card-heading > button {
    font-size: 13px;
  }
  .compact-orders article {
    padding: 17px 0;
  }
  .company-avatar {
    width: 44px;
    height: 44px;
  }
  .compact-orders article strong,
  .activity-card button strong {
    font-size: 14px;
  }
  .compact-orders small,
  .activity-card button small {
    font-size: 11px;
  }
  .compact-orders em {
    padding: 8px 11px;
    font-size: 11px;
  }
  .activity-card > button {
    padding: 17px 0;
  }
  .activity-card button i {
    width: 44px;
    height: 44px;
    font-size: 18px;
  }
  .smart-empty {
    min-height: 340px;
  }
  .smart-empty > div {
    width: 76px;
    height: 76px;
    font-size: 34px;
  }
  .smart-empty h3 {
    font-size: 21px;
  }
  .smart-empty p {
    max-width: 440px;
    font-size: 14px;
  }
  .smart-empty a {
    font-size: 13px;
  }
  .filter-pills button {
    padding: 11px 15px;
    font-size: 12px;
  }
  .full-card {
    min-height: 650px;
  }
  .order-list article {
    min-height: 85px;
    font-size: 14px;
  }
  .order-list small {
    font-size: 12px;
  }
  .order-list em {
    font-size: 12px;
  }
  .dealer-table > div {
    padding: 20px;
    font-size: 14px;
  }
  .dealer-table .head {
    font-size: 12px;
  }
  .dealer-table span {
    font-size: 14px;
  }
}
.brand-copy > span {
  font-size: 15px;
}
.brand-copy h2 {
  font-size: 58px;
}
.brand-copy p {
  font-size: 21px;
}
.brand-features b {
  font-size: 15px;
}
.brand-features span {
  font-size: 18px;
}
.brand-panel > small {
  font-size: 14px;
}
.login-form-panel .login-brand strong {
  font-size: 20px;
}
.login-form-panel .login-brand small {
  font-size: 14px;
}
.login-form-panel > span {
  font-size: 14px;
}
.login-form-panel h1 {
  font-size: 49px;
}
.login-form-panel > p {
  font-size: 19px;
}
.login-form-panel form > label {
  font-size: 16px;
}
.login-form-panel .password-field input {
  font-size: 17px;
}
.login-form-panel form > button {
  font-size: 17px;
}
.login-form-panel > em {
  font-size: 15px;
}
.login-form-panel footer {
  font-size: 14px;
}
.pdf-button {
  padding: 9px 12px;
  border: 1px solid #cbdcf3;
  border-radius: 8px;
  background: #edf4ff;
  color: #205cac;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
}
.pdf-button:hover {
  background: #205cac;
  color: #fff;
}
.dashboard-layout {
  font-size: 17px;
}
.dashboard-sidebar nav button,
.dashboard-sidebar nav a {
  font-size: 17px;
}
.side-brand strong {
  font-size: 20px;
}
.side-brand small,
.side-user small {
  font-size: 13px;
}
.side-user strong {
  font-size: 16px;
}
.dashboard-top p strong {
  font-size: 23px;
}
.dashboard-top p small {
  font-size: 13px;
}
.top-actions input,
.top-actions > button {
  font-size: 16px;
}
.welcome-row > div > span,
.card-heading > div > span,
.activity-card > span {
  font-size: 13px;
}
.welcome-row h1 {
  font-size: 42px;
}
.welcome-row p {
  font-size: 17px;
}
.metric p > span {
  font-size: 15px;
}
.metric strong {
  font-size: 32px;
}
.metric small {
  font-size: 13px;
}
.card-heading h2,
.activity-card h2 {
  font-size: 28px;
}
.card-heading > button {
  font-size: 15px;
}
.activity-card button strong,
.compact-orders article strong {
  font-size: 16px;
}
.activity-card button small,
.compact-orders small {
  font-size: 13px;
}
.smart-empty h3 {
  font-size: 24px;
}
.smart-empty p {
  font-size: 16px;
}
.smart-empty a {
  font-size: 15px;
}
.filter-pills button {
  font-size: 14px;
}
.order-list article {
  grid-template-columns: 1fr 2fr 0.8fr auto auto;
  font-size: 16px;
}
.order-list small,
.dealer-table span {
  font-size: 14px;
}
.order-list em {
  font-size: 13px;
}
.dealer-table .head {
  font-size: 14px;
}
.admin-floating-tools {
  position: fixed;
  z-index: 20;
  right: 28px;
  bottom: 24px;
  display: flex;
  gap: 9px;
}
.admin-floating-tools button {
  padding: 13px 17px;
  border: 0;
  border-radius: 12px;
  background: #174f9b;
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  box-shadow: 0 10px 28px #174f9b38;
  cursor: pointer;
}
.admin-overlay {
  position: fixed;
  z-index: 100;
  inset: 0;
  padding: 35px;
  display: grid;
  place-items: center;
  background: #07162eb8;
  backdrop-filter: blur(5px);
}
.admin-manager {
  position: relative;
  width: min(1200px, 100%);
  max-height: 92vh;
  overflow: auto;
  padding: 34px;
  border-radius: 22px;
  background: #f7f9fc;
  box-shadow: 0 30px 90px #0005;
}
.manager-close {
  position: absolute;
  right: 20px;
  top: 18px;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: #e6ecf5;
  font-size: 25px;
  cursor: pointer;
}
.product-form,
.dealer-form {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  padding: 20px;
  border: 1px solid #dfe6ef;
  border-radius: 14px;
  background: #fff;
}
.product-form label,
.dealer-form label,
.product-admin-list label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 13px;
  font-weight: 800;
}
.product-form input,
.dealer-form input,
.product-admin-list input {
  height: 43px;
  padding: 0 11px;
  border: 1px solid #cfdaea;
  border-radius: 8px;
}
.product-form > button,
.dealer-form > button,
.product-admin-list article > button {
  border: 0;
  border-radius: 9px;
  background: #2361b5;
  color: #fff;
  font-weight: 800;
  cursor: pointer;
}
.product-admin-list {
  margin-top: 20px;
  display: grid;
  gap: 8px;
}
.product-admin-list article {
  display: grid;
  grid-template-columns: 70px minmax(220px, 1fr) 130px 100px 110px 90px;
  gap: 14px;
  align-items: center;
  padding: 12px;
  border: 1px solid #e0e6ee;
  border-radius: 12px;
  background: #fff;
}
.product-admin-list img {
  width: 65px;
  height: 65px;
  border-radius: 9px;
  object-fit: contain;
  background: #f2f4f8;
}
.product-admin-list article > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.product-admin-list small {
  color: #8792a4;
}
.product-admin-list em {
  padding: 8px;
  border-radius: 15px;
  background: #e7f7ee;
  color: #28794b;
  text-align: center;
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
}
.product-admin-list em.low {
  background: #fff4d9;
  color: #a87318;
}
.product-admin-list em.out {
  background: #ffe6e8;
  color: #b53846;
}
.analytics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
}
.analytics-grid > article {
  padding: 25px;
  display: flex;
  flex-direction: column;
  border: 1px solid #dfe6ef;
  border-radius: 14px;
  background: #fff;
}
.analytics-grid span {
  color: #7d899c;
}
.analytics-grid strong {
  margin-top: 10px;
  font-size: 28px;
}
.stock-alert {
  padding: 14px;
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #e1e6ee;
  background: #fff;
}
.stock-alert span {
  color: #bd3a49;
  font-weight: 800;
}
.dealer-manager {
  max-width: 900px;
}
.dealer-form > button {
  min-height: 48px;
}
.manager-error {
  padding: 12px;
  border-radius: 9px;
  background: #ffe8ea;
  color: #b23342;
}
@media (max-width: 800px) {
  .admin-overlay {
    padding: 10px;
  }
  .admin-manager {
    padding: 22px;
  }
  .product-form,
  .dealer-form,
  .analytics-grid {
    grid-template-columns: 1fr;
  }
  .product-admin-list article {
    grid-template-columns: 65px 1fr;
  }
  .product-admin-list article > *:not(img):not(div) {
    grid-column: 1/-1;
  }
  .admin-floating-tools {
    right: 12px;
    bottom: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}
.admin-floating-tools {
  left: 24px !important;
  right: auto !important;
  top: 390px !important;
  bottom: auto !important;
  width: 252px;
  display: grid !important;
  gap: 6px !important;
}
.admin-floating-tools button {
  min-height: 54px;
  padding: 0 16px !important;
  display: flex;
  align-items: center;
  gap: 13px;
  border-radius: 10px !important;
  background: transparent !important;
  color: #c3d6ef !important;
  font-size: 19px !important;
  text-align: left;
  box-shadow: none !important;
}
.admin-floating-tools button:hover {
  background: #ffffff12 !important;
  color: #fff !important;
}
.admin-floating-tools button span {
  font-size: 16px;
}
@media (max-width: 800px) {
  .admin-floating-tools {
    left: 10px !important;
    right: 10px !important;
    top: auto !important;
    bottom: 10px !important;
    width: auto;
    display: flex !important;
    padding: 7px;
    border-radius: 12px;
    background: #0d3470;
  }
  .admin-floating-tools button {
    flex: 1;
    justify-content: center;
  }
  .admin-floating-tools button span {
    font-size: 12px;
  }
}
.admin-manager {
  width: min(1450px, 96vw);
  padding: 46px;
  border-radius: 28px;
  background: linear-gradient(145deg, #f9fbff, #f1f5fb);
}
.admin-manager > .card-heading {
  padding: 0 5px 28px;
  border-bottom: 1px solid #dce4ef;
}
.admin-manager .card-heading span {
  font-size: 14px;
  letter-spacing: 2px;
}
.admin-manager .card-heading h2 {
  margin-top: 9px;
  font-size: 34px;
}
.admin-manager .card-heading > b {
  margin-right: 55px;
  padding: 10px 15px;
  border-radius: 20px;
  background: #fff0f1;
  color: #b53646;
  font-size: 14px;
}
.manager-close {
  right: 28px;
  top: 25px;
  width: 48px;
  height: 48px;
  background: #e6edf7;
  color: #18365f;
  font-size: 29px;
}
.product-form {
  grid-template-columns: 1.2fr 1.2fr 0.75fr 0.65fr;
  gap: 20px;
  margin-top: 26px;
  padding: 28px;
  border-radius: 18px;
  box-shadow: 0 10px 35px #183b750d;
}
.product-form label,
.dealer-form label,
.product-admin-list label {
  gap: 10px;
  font-size: 16px;
}
.product-form input,
.dealer-form input,
.product-admin-list input {
  height: 54px;
  padding: 0 15px;
  border-radius: 10px;
  font-size: 16px;
  background: #f9fbff;
}
.product-form label:nth-of-type(5) {
  grid-column: 1/3;
}
.product-form > button {
  min-height: 54px;
  grid-column: 3/5;
  font-size: 17px;
  background: linear-gradient(110deg, #174c99, #2b72cc);
  box-shadow: 0 10px 24px #1e5ca52e;
}
.product-admin-list {
  margin-top: 26px;
  gap: 12px;
}
.product-admin-list article {
  grid-template-columns: 90px minmax(280px, 1fr) 150px 120px 125px 105px;
  gap: 18px;
  padding: 18px;
  border-radius: 16px;
  box-shadow: 0 6px 22px #183b7509;
}
.product-admin-list img {
  width: 82px;
  height: 82px;
  border-radius: 12px;
}
.product-admin-list article > div strong {
  font-size: 17px;
}
.product-admin-list article > div small {
  font-size: 13px;
}
.product-admin-list em {
  padding: 11px;
  font-size: 13px;
}
.product-admin-list article > button {
  min-height: 44px;
  font-size: 14px;
}
.admin-floating-tools {
  top: 410px !important;
  width: 252px;
}
.admin-floating-tools::before {
  content: 'YÖNETİM ARAÇLARI';
  margin: 0 13px 8px;
  color: #6f98cd;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1.6px;
}
.admin-floating-tools button {
  min-height: 58px !important;
  padding: 0 18px !important;
  gap: 15px !important;
  border-radius: 11px !important;
  font-size: 22px !important;
}
.admin-floating-tools button span {
  font-size: 17px !important;
}
.admin-floating-tools button:hover {
  padding-left: 22px !important;
  background: #ffffff14 !important;
}
.dealer-form {
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  padding: 28px;
}
.dealer-form > button {
  font-size: 17px;
}
@media (max-width: 900px) {
  .admin-manager {
    width: 100%;
    padding: 24px;
    border-radius: 18px;
  }
  .admin-manager .card-heading h2 {
    font-size: 26px;
  }
  .product-form,
  .dealer-form {
    grid-template-columns: 1fr;
    padding: 19px;
  }
  .product-form label:nth-of-type(5),
  .product-form > button {
    grid-column: auto;
  }
  .product-admin-list article {
    grid-template-columns: 75px 1fr;
  }
  .admin-floating-tools::before {
    display: none;
  }
}
.dealer-table > div {
  grid-template-columns: 1.2fr 0.85fr 1.4fr 0.6fr 1fr 1.05fr 0.85fr 70px;
}
.approval-button{min-height:34px;padding:6px 9px;border:1px solid #f1cf86;border-radius:8px;background:#fff8e7;color:#95640b;font-size:10px;font-weight:800;cursor:pointer}.approval-button.approved{border-color:#a9ddbd;background:#eaf8ef;color:#237446}.approval-button:hover{filter:brightness(.96)}
.discount-editor {
  display: flex !important;
  flex-direction: row !important;
  align-items: center;
  gap: 6px !important;
}
.discount-editor input {
  width: 72px;
  height: 34px;
  padding: 0 7px;
  border: 1px solid #ced8e7;
  border-radius: 7px;
}
.discount-editor button {
  height: 34px;
  padding: 0 9px;
  border: 0;
  border-radius: 7px;
  background: #2859af;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}
.delete-dealer {
  height: 34px;
  padding: 0 12px;
  border: 1px solid #efc6cc;
  border-radius: 8px;
  background: #fff1f2;
  color: #b52f40;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.delete-dealer:hover {
  border-color: #cf4354;
  background: #cf4354;
  color: #fff;
}
.delete-dealer:disabled {
  opacity: 0.55;
  cursor: wait;
}
.multi-price-form {
  grid-template-columns: repeat(4, 1fr) !important;
}
.multi-price-form label:nth-of-type(5) {
  grid-column: auto !important;
}
.multi-price-form select,
.multi-price-list select {
  height: 54px;
  padding: 0 12px;
  border: 1px solid #cfdaea;
  border-radius: 10px;
  background: #f9fbff;
  font-size: 16px;
}
.multi-price-list article {
  grid-template-columns: 82px minmax(230px, 1fr) repeat(3, 110px) 115px 90px 105px 90px !important;
}
.multi-price-list label {
  min-width: 0;
}
.multi-price-list input {
  width: 100%;
}
@media (max-width: 1100px) {
  .multi-price-form {
    grid-template-columns: repeat(2, 1fr) !important;
  }
  .multi-price-list article {
    grid-template-columns: 75px 1fr !important;
  }
  .multi-price-list article > *:not(img):not(div) {
    grid-column: 1/-1;
  }
}
.product-manager {
  max-height: 96vh;
  background: #f3f6fb;
}
.product-manager > .card-heading {
  margin-bottom: 20px;
}
.product-manager > .card-heading p {
  margin: 8px 0 0;
  color: #7b8799;
  font-size: 14px;
}
.product-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 18px;
}
.product-metrics article {
  padding: 16px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #dfe7f1;
  border-radius: 14px;
  background: #fff;
}
.product-metrics span {
  color: #758398;
  font-size: 13px;
}
.product-metrics strong {
  color: #173a70;
  font-size: 23px;
}
.product-metrics .danger strong {
  color: #c33d4d;
}
.new-product-panel {
  margin-bottom: 18px;
  border: 1px solid #d7e2f0;
  border-radius: 16px;
  background: #fff;
  overflow: hidden;
}
.new-product-panel summary {
  padding: 17px 20px;
  display: flex;
  align-items: center;
  gap: 13px;
  list-style: none;
  cursor: pointer;
}
.new-product-panel summary > span {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background: #e8f1ff;
  color: #2565b9;
  font-size: 23px;
}
.new-product-panel summary > div {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}
.new-product-panel summary small {
  color: #8793a5;
}
.new-product-panel summary > b {
  color: #2565b9;
  font-size: 13px;
}
.new-product-panel[open] summary {
  border-bottom: 1px solid #e2e8f1;
}
.new-product-panel .product-form {
  margin: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.manager-success {
  padding: 12px 15px;
  border-radius: 9px;
  background: #e7f8ef;
  color: #197447;
  font-weight: 700;
}
.product-list-toolbar {
  position: sticky;
  z-index: 4;
  top: -46px;
  padding: 13px 15px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid #dce5f0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 24px #183b750d;
}
.product-list-toolbar > label {
  height: 42px;
  min-width: 260px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid #d7e0ec;
  border-radius: 9px;
  color: #7d8ba0;
}
.product-list-toolbar input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
}
.product-list-toolbar > div {
  display: flex;
  gap: 5px;
}
.product-list-toolbar button {
  padding: 9px 12px;
  border: 0;
  border-radius: 8px;
  background: #f0f4f9;
  color: #6f7d91;
  font-weight: 700;
  cursor: pointer;
}
.product-list-toolbar button.active {
  background: #245faf;
  color: #fff;
}
.product-list-toolbar > span {
  margin-left: auto;
  color: #7c899b;
  font-size: 13px;
}
.default-price-chip {
  width: max-content;
  margin-top: 3px;
  padding: 4px 7px;
  border-radius: 7px;
  background: #e8f1ff;
  color: #255fae !important;
  font-size: 10px !important;
  font-weight: 800;
}
.multi-price-list article {
  transition: 0.18s ease;
}
.multi-price-list article:hover {
  border-color: #bfd2eb;
  box-shadow: 0 10px 28px #183b7512;
  transform: translateY(-1px);
}
.multi-price-list article > button:disabled {
  opacity: 0.65;
  cursor: wait;
}
.product-empty {
  min-height: 220px;
  display: flex !important;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 7px;
  color: #8290a3;
}
.product-empty > span {
  font-size: 34px;
}
.product-empty > strong {
  color: #324866;
  font-size: 18px;
}
.product-empty > small {
  font-size: 13px;
}
@media (max-width: 900px) {
  .product-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
  .product-list-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .product-list-toolbar > label {
    min-width: 0;
  }
  .product-list-toolbar > div {
    overflow: auto;
  }
  .product-list-toolbar > span {
    margin-left: 0;
  }
  .product-manager > .card-heading p {
    display: none;
  }
}
.advanced-product-form{padding:24px;background:#f6f8fc}.form-section{margin-bottom:16px;padding:22px;border:1px solid #dde6f1;border-radius:16px;background:#fff}.form-section>header{display:flex;align-items:center;gap:12px;margin-bottom:18px}.form-section>header>span{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:#e8f1ff;color:#2362b6;font-weight:900}.form-section>header>div{display:flex;flex-direction:column;gap:3px}.form-section>header strong{font-size:17px}.form-section>header small,.product-basics label>small{color:#8a96a8;font-size:11px}.product-basics>div{display:grid;grid-template-columns:1.5fr 1.2fr .6fr;gap:15px}.product-basics label{display:flex;flex-direction:column;gap:8px;font-size:13px;font-weight:800}.product-basics input{height:50px;padding:0 14px;border:1px solid #ccd8e8;border-radius:10px;background:#f9fbfe;font-size:15px;outline:none}.product-basics input:focus,.price-cards input:focus{border-color:#2d6dc3;box-shadow:0 0 0 3px #2d6dc315}.price-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.price-cards>label{position:relative;padding:17px;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:5px 10px;border:2px solid #e1e7f0;border-radius:14px;background:#fbfcfe;transition:.18s}.price-cards>label.selected{border-color:#2a68bd;background:#f1f6ff;box-shadow:0 8px 24px #2563b51a}.price-cards label>button{position:absolute;right:10px;top:10px;padding:5px 8px;border:0;border-radius:7px;background:#e9eef5;color:#758196;font-size:10px;font-weight:800;cursor:pointer}.price-cards label.selected>button{background:#2866ba;color:#fff}.price-cards label>span{grid-row:1/3;width:40px;height:40px;display:grid;place-items:center;border-radius:11px;background:#e8eff9;color:#225ca8;font-size:20px;font-weight:900}.price-cards label>strong{padding-right:85px;font-size:14px}.price-cards input{grid-column:1/-1;height:50px;padding:0 13px;border:1px solid #ccd8e8;border-radius:9px;background:#fff;font-size:18px;font-weight:800;outline:none}.price-cards label>small{grid-column:1/-1;color:#8995a7;font-size:10px}.price-warning{margin:13px 0 0;padding:10px 12px;border-radius:8px;background:#fff2df;color:#a66713;font-size:12px;font-weight:700}.image-drop{min-height:100px;padding:14px;display:flex;align-items:center;gap:15px;border:2px dashed #bfd0e5;border-radius:13px;background:#f7faff;cursor:pointer}.image-drop input{display:none}.image-drop>img,.image-drop>span{width:76px;height:76px;display:grid;place-items:center;border-radius:10px;background:#e7effa;object-fit:contain;color:#326bb7;font-size:28px}.image-drop>div{display:flex;flex-direction:column;gap:5px}.image-drop small{color:#8592a5}.product-form-footer{padding:18px 22px;display:flex;align-items:center;justify-content:space-between;border:1px solid #dce5f1;border-radius:15px;background:#fff}.product-form-footer>div{display:grid;grid-template-columns:auto auto;gap:3px 10px}.product-form-footer span,.product-form-footer small{color:#8390a3;font-size:11px}.product-form-footer small{grid-column:1/-1}.product-form-footer button{min-width:270px;height:52px;border:0;border-radius:11px;background:linear-gradient(110deg,#174c99,#2d74ce);color:#fff;font-size:15px;font-weight:900;box-shadow:0 10px 22px #245fac2b;cursor:pointer}.product-form-footer button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:900px){.product-basics>div,.price-cards{grid-template-columns:1fr}.advanced-product-form{padding:12px}.form-section{padding:16px}.product-form-footer{align-items:stretch;flex-direction:column;gap:14px}.product-form-footer button{width:100%;min-width:0}}
.orders-workspace{display:grid;gap:18px}.orders-hero{padding:27px 30px;display:flex;align-items:center;justify-content:space-between;border-radius:19px;background:linear-gradient(120deg,#0b326d,#2265b5);color:#fff;box-shadow:0 15px 35px #123d7825}.orders-hero>div>span{color:#75b9ff;font-size:11px;font-weight:900;letter-spacing:1.8px}.orders-hero h2{margin:7px 0 5px;font-size:28px}.orders-hero p{margin:0;color:#c6d8ef;font-size:13px}.export-orders{height:44px;padding:0 17px;border:1px solid #ffffff45;border-radius:10px;background:#ffffff12;color:#fff;font-weight:800;cursor:pointer}.export-orders:hover{background:#fff;color:#174e95}.order-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:13px}.order-metrics article{padding:19px 21px;display:flex;flex-direction:column;border:1px solid #dde5ef;border-radius:15px;background:#fff;box-shadow:0 7px 24px #1737650a}.order-metrics span{color:#778599;font-size:12px}.order-metrics strong{margin:7px 0 3px;color:#12366d;font-size:24px}.order-metrics small{color:#9aa4b3;font-size:10px}.order-metrics .pending{border-color:#f1dfb8;background:#fffaf0}.order-metrics .pending strong{color:#b47616}.orders-toolbar{padding:13px;display:flex;align-items:center;gap:10px;border:1px solid #dde5ef;border-radius:14px;background:#fff}.orders-toolbar>label{height:42px;min-width:310px;padding:0 13px;display:flex;align-items:center;gap:8px;border:1px solid #d5deeb;border-radius:9px;color:#8491a4}.orders-toolbar input{width:100%;border:0;outline:0;background:transparent}.orders-toolbar .filter-pills{margin-left:auto}.orders-refresh{height:40px;padding:0 13px;border:1px solid #d7e1ed;border-radius:9px;background:#f7f9fc;color:#53657d;font-weight:800;cursor:pointer}.advanced-order-list{display:grid;gap:10px}.advanced-order-list>article{border:1px solid #dfe6ef;border-radius:15px;background:#fff;overflow:hidden;transition:.18s}.advanced-order-list>article:hover,.advanced-order-list>article.expanded{border-color:#bcd0e9;box-shadow:0 10px 30px #1539680e}.order-main{min-height:96px;padding:15px 17px;display:grid;grid-template-columns:48px 1.15fr 1.6fr .75fr .75fr auto auto;align-items:center;gap:15px}.order-avatar{width:46px;height:46px;display:grid;place-items:center;border-radius:12px;background:linear-gradient(145deg,#e7f1ff,#d7e8ff);color:#205ca9;font-size:18px;font-weight:900}.order-identity,.order-product-preview,.order-date,.order-amount{min-width:0;display:flex;flex-direction:column;gap:4px}.order-main small{color:#929daf;font-size:9px;font-weight:800;letter-spacing:.7px}.order-main strong{color:#17335e;font-size:13px}.order-identity>span,.order-product-preview>span{overflow:hidden;color:#748197;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.order-main>em{padding:8px 11px;border-radius:16px;background:#fff1d5;color:#a76c12;font-size:10px;font-style:normal;font-weight:900}.order-actions{display:flex;gap:5px}.order-actions button{height:34px;padding:0 10px;border:1px solid #cbdcf1;border-radius:8px;background:#f1f6ff;color:#205ca9;font-size:10px;font-weight:900;cursor:pointer}.order-actions button:hover{background:#205ca9;color:#fff}.order-details{padding:0 80px 18px;background:#f7f9fc;border-top:1px solid #e5eaf1}.order-details>header{padding:15px 0 10px;display:flex;justify-content:space-between;color:#526279;font-size:12px}.order-detail-row{padding:10px 12px;display:grid;grid-template-columns:40px 1fr 130px 130px;gap:10px;border-top:1px solid #e1e7ef;background:#fff}.order-detail-row>span{color:#2864b7;font-weight:900}.order-detail-row>strong{font-size:12px}.order-detail-row>small,.order-detail-row>b{text-align:right;font-size:11px}.order-details>footer{margin-top:10px;padding:12px;border-radius:9px;background:#fff5df;color:#8b651e}.order-details footer span{font-size:10px;font-weight:900}.order-details footer p{margin:5px 0 0;font-size:12px}.order-empty button{margin-top:14px;padding:10px 14px;border:0;border-radius:8px;background:#2562b5;color:#fff;font-weight:800;cursor:pointer}@media(max-width:1100px){.order-metrics{grid-template-columns:repeat(2,1fr)}.order-main{grid-template-columns:48px 1fr 1fr auto}.order-date,.order-amount{display:none}.order-details{padding:0 20px 18px}}@media(max-width:760px){.orders-hero{align-items:flex-start;gap:18px;flex-direction:column}.order-metrics{grid-template-columns:1fr 1fr}.orders-toolbar{align-items:stretch;flex-direction:column}.orders-toolbar>label{min-width:0}.orders-toolbar .filter-pills{margin-left:0;overflow:auto}.order-main{grid-template-columns:42px 1fr auto}.order-product-preview,.order-main>em{display:none}.order-actions{grid-column:1/-1}.order-actions button{flex:1}.order-details{padding:0 10px 15px}.order-detail-row{grid-template-columns:32px 1fr}.order-detail-row>small,.order-detail-row>b{grid-column:2;text-align:left}}
.advanced-product-form{display:grid;grid-template-columns:minmax(0,2fr) minmax(300px,.8fr);grid-template-areas:"basics media" "price price" "footer footer";gap:16px}.advanced-product-form .form-section{margin:0}.advanced-product-form .product-basics{grid-area:basics}.advanced-product-form .media-section{grid-area:media}.advanced-product-form .price-section{grid-area:price}.advanced-product-form .product-form-footer{grid-area:footer}.advanced-product-form .image-drop{min-height:144px;justify-content:center;flex-direction:column;gap:11px;border-color:#91b5df;background:#f3f8ff;text-align:center;transition:.18s}.advanced-product-form .image-drop:hover{border-color:#2867ba;background:#eaf3ff}.advanced-product-form .image-drop>img,.advanced-product-form .image-drop>span{width:92px;height:92px}@media(max-width:900px){.advanced-product-form{grid-template-columns:1fr;grid-template-areas:"basics" "media" "price" "footer"}}
.admin-creator-credit{position:fixed;z-index:1200;right:18px;bottom:14px;padding:5px;color:#536985;background:transparent;text-align:right;font-size:11px;font-weight:700;letter-spacing:.2px;text-shadow:0 1px 1px #fff}

/* Sipariş yönetimi: daha ferah kartlar ve okunaklı detay görünümü */
.orders-workspace{max-width:1480px;margin:0 auto;gap:20px}
.orders-toolbar{padding:12px 14px;border-color:#d9e3f0;border-radius:16px;box-shadow:0 7px 22px #1638650a}
.orders-toolbar>label{height:46px;border-color:#d2deed;border-radius:11px;background:#f9fbfe;transition:.2s}
.orders-toolbar>label:focus-within{border-color:#2d69b9;background:#fff;box-shadow:0 0 0 4px #2b67b714}
.filter-pills{display:flex;gap:6px;padding:4px;border-radius:11px;background:#f0f4f9}
.filter-pills button{min-height:37px;padding:0 15px;border:0;border-radius:8px;background:transparent;color:#748198;font-weight:800;cursor:pointer}
.filter-pills button.active{background:#fff;color:#205ca9;box-shadow:0 3px 10px #153c7114}
.orders-refresh{height:45px;border-radius:10px;background:#fff;transition:.2s}
.orders-refresh:hover{border-color:#2b67b8;color:#205ca9;transform:translateY(-1px)}
.advanced-order-list{gap:14px}
.advanced-order-list>article{border-color:#dce5f0;border-radius:18px;box-shadow:0 7px 25px #183b6909}
.advanced-order-list>article:hover{transform:translateY(-1px);box-shadow:0 13px 32px #173b6a10}
.advanced-order-list>article.expanded{border-color:#a9c5e8;box-shadow:0 14px 35px #1c579d17}
.order-main{min-height:104px;padding:18px 20px;grid-template-columns:50px minmax(210px,1.2fr) minmax(260px,1.55fr) minmax(140px,.7fr) minmax(120px,.65fr) auto 128px;gap:18px}
.order-avatar{width:48px;height:48px;border-radius:14px;background:linear-gradient(145deg,#e8f2ff,#d5e7ff);box-shadow:inset 0 0 0 1px #c7ddf8}
.order-main small{color:#8b98aa;letter-spacing:1px}
.order-main strong{font-size:13px;line-height:1.35}
.order-identity>strong{color:#12549d;font-size:14px}
.order-amount>strong{color:#123b72;font-size:15px}
.order-main>em{white-space:nowrap;border:1px solid #f2dba8;background:#fff7e7}
.order-actions{justify-content:flex-end}
.order-actions button{height:38px;padding:0 12px;border-radius:9px;background:#f5f9ff;transition:.18s}
.order-details{margin:0 18px 18px;padding:16px 18px 18px;border:1px solid #dfe8f3;border-radius:14px;background:#f6f9fd}
.order-details>header{height:auto;min-height:0;padding:0 2px 13px;border:0;border-bottom:1px solid #dce5f0;background:transparent;color:#627188}
.order-details>header strong{color:#173b6c;font-size:13px}
.order-details>header span{padding:5px 9px;border-radius:20px;background:#e5eef9;color:#4d6687;font-size:10px;font-weight:800}
.order-detail-row{min-height:54px;margin-top:8px;padding:11px 14px;align-items:center;border:1px solid #e0e7f0;border-radius:10px;background:#fff;box-shadow:0 3px 12px #183b6908}
.order-detail-row>span{width:34px;height:30px;display:grid;place-items:center;border-radius:8px;background:#e9f2ff}
.order-detail-row>strong{color:#203b62}
.order-detail-row>b{color:#163f77;font-size:12px}
.order-details>footer{border:1px solid #f0deb9}
@media(max-width:1200px){.order-main{grid-template-columns:48px 1.1fr 1.35fr .75fr auto}.order-amount{display:flex}.order-main>em{display:none}.order-actions{grid-column:auto}}
@media(max-width:760px){.order-details{margin:0 8px 10px;padding:12px}.order-main{grid-template-columns:42px 1fr auto}.order-amount{display:none}.order-actions{grid-column:1/-1}.filter-pills{overflow:auto}.filter-pills button{white-space:nowrap}}
.product-row-actions{display:flex;align-items:center;gap:7px}.product-row-actions button{height:44px;padding:0 15px;border:0;border-radius:9px;font-size:11px;font-weight:900;cursor:pointer}.product-row-actions button:first-child{background:#2867ba;color:#fff}.product-row-actions .delete-product{border:1px solid #efc4ca;background:#fff1f2;color:#b72d40}.product-row-actions .delete-product:hover{background:#c83a4c;color:#fff}.product-row-actions button:disabled{opacity:.55;cursor:wait}
.order-status-control{min-width:128px;display:flex;flex-direction:column;gap:4px}.order-status-control>small{font-size:8px!important}.order-status-control select{height:36px;padding:0 27px 0 10px;border:1px solid;border-radius:9px;font-size:10px;font-weight:900;outline:0;cursor:pointer}.order-status-control.approved select{border-color:#b9d2f2;background:#edf5ff;color:#245f9f}.order-status-control.preparing select{border-color:#efd391;background:#fff7e6;color:#a36b0c}.order-status-control.shipping select{border-color:#a9d9ec;background:#edfaff;color:#167392}.order-status-control.completed select{border-color:#a9ddbd;background:#ecf9f1;color:#247448}.order-status-control.cancelled select{border-color:#efb9c1;background:#fff0f2;color:#b12f42}.order-status-control select:disabled{opacity:.6;cursor:wait}.filter-pills{max-width:720px;overflow-x:auto;scrollbar-width:thin}.filter-pills button{white-space:nowrap}
@media(max-width:1200px){.order-status-control{display:none}}
.order-details>footer{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;background:transparent;border:0;padding:0}.order-details>footer>div{padding:13px;border:1px solid #e5d6b8;border-radius:10px;background:#fff8e9}.order-details>footer span{color:#8b651e;letter-spacing:.7px}.order-details>footer p{color:#56657a;line-height:1.5}.dealer-address-field{grid-column:1/-1}.dealer-form textarea{min-height:82px;padding:11px 12px;border:1px solid #ccd8e8;border-radius:9px;background:#f9fbfe;font:inherit;resize:vertical}.dealer-form textarea:focus{border-color:#2b67b8;outline:0;box-shadow:0 0 0 3px #2b67b815}@media(max-width:700px){.order-details>footer{grid-template-columns:1fr}}
.shipping-editor{margin:12px 0;padding:14px;display:grid;grid-template-columns:minmax(210px,1.3fr) 1fr 1fr auto;align-items:end;gap:12px;border:1px solid #c9dcf1;border-radius:12px;background:linear-gradient(120deg,#edf5ff,#f8fbff)}.shipping-editor>div{display:flex;align-items:center;gap:10px}.shipping-editor>div>span{width:38px;height:38px;display:grid;place-items:center;border-radius:10px;background:#dcecff;font-size:19px}.shipping-editor p,.shipping-editor label{display:flex;flex-direction:column;gap:4px;margin:0}.shipping-editor p strong{color:#174b89;font-size:12px}.shipping-editor p small,.shipping-editor label{color:#73849a;font-size:9px}.shipping-editor input{height:40px;padding:0 11px;border:1px solid #bfd1e7;border-radius:9px;background:#fff;color:#203b62;outline:0}.shipping-editor input:focus{border-color:#2a67b8;box-shadow:0 0 0 3px #2a67b812}.shipping-editor>button{height:40px;padding:0 15px;border:0;border-radius:9px;background:#2865b5;color:#fff;font-size:10px;font-weight:900;cursor:pointer}.shipping-editor>button:disabled{opacity:.55;cursor:wait}@media(max-width:1000px){.shipping-editor{grid-template-columns:1fr 1fr}.shipping-editor>div{grid-column:1/-1}}@media(max-width:650px){.shipping-editor{grid-template-columns:1fr}.shipping-editor>div{grid-column:auto}}
.orders-date-toolbar{margin-top:-7px;padding:11px 14px;display:flex;align-items:center;gap:14px;border:1px solid #dce6f2;border-radius:14px;background:#fff;box-shadow:0 7px 22px #16386508}.date-pills{display:flex;gap:6px}.date-pills button{height:36px;padding:0 14px;border:1px solid #d9e3ef;border-radius:9px;background:#f7f9fc;color:#65758d;font-size:10px;font-weight:900;cursor:pointer}.date-pills button.active{border-color:#2865b5;background:#2865b5;color:#fff}.date-range{display:flex;align-items:center;gap:8px}.date-range label{display:flex;align-items:center;gap:7px;color:#74839a;font-size:9px;font-weight:800}.date-range input{width:135px;height:36px;padding:0 9px;border:1px solid #cfdbeb;border-radius:8px;background:#f9fbfe;color:#243d62}.date-result{margin-left:auto;color:#7c899c;font-size:10px;font-weight:800}.order-actions .archive-order{border-color:#efbdc4;background:#fff0f2;color:#b3293e}.order-actions .archive-order:hover{background:#bd3045;color:#fff}.order-status-control.deleted select{border-color:#cad0d9;background:#eff1f4;color:#687385}@media(max-width:900px){.orders-date-toolbar{align-items:stretch;flex-direction:column}.date-pills{overflow:auto}.date-pills button{white-space:nowrap}.date-range{flex-wrap:wrap}.date-result{margin-left:0}.date-range input{width:125px}}
.product-page.admin-overlay{inset:78px 0 0 255px;padding:0;display:block;background:#f3f6fb;backdrop-filter:none}.product-page .product-manager{width:100%;height:100%;max-height:none;padding:38px 44px;border-radius:0;background:#f3f6fb;box-shadow:none}.product-page .manager-close{position:absolute;z-index:2}.product-page .new-product-panel{border:0;background:transparent;overflow:visible}.product-page .advanced-product-form{padding:0;background:transparent}.top-live-rates{height:46px;padding:6px 10px;display:flex;align-items:center;gap:10px;border:1px solid #d1dfee;border-radius:11px;background:#fff}.top-live-rates>span{display:flex;align-items:baseline;gap:5px;white-space:nowrap}.top-live-rates small{color:#75859b;font-size:8px;font-weight:900}.top-live-rates strong{color:#123b77;font-size:11px}.top-live-rates>i{width:1px;height:22px;background:#dbe4ef}.top-live-rates>em{padding:4px 6px;border-radius:6px;background:#e9f7ef;color:#238052;font-size:7px;font-style:normal;font-weight:900}.top-live-rates.stale>em{background:#fff1d7;color:#a36b0e}@media(min-width:1101px){.product-page.admin-overlay{left:300px}}@media(max-width:1100px){.top-live-rates{display:none}}@media(max-width:900px){.product-page.admin-overlay{inset:0}.product-page .product-manager{padding:75px 16px 24px}.product-page .manager-close{top:15px;right:15px}}
</style>
