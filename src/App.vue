<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import ndfLogo from './assets/ndf-logo.png'
import heroBg from './assets/hero-bg.jpg'
import { products, type CatalogProduct } from './data/products'
import { api, ApiError, type AuthDto, type OrderDto } from './services/api'
import AdminPanel from './components/AdminPanel.vue'

type View = 'home' | 'register' | 'login' | 'account'

interface Dealer {
  id?: number
  company: string
  official: string
  taxNumber: string
  city: string
  phone: string
  email: string
  password: string
  discountPercent: number
}
interface Order {
  id: string
  date: string
  itemCount: number
  total: number
  status: 'Hazırlanıyor'
  note: string
}

const view = ref<View>('home')
const isAdminPage = window.location.pathname.replace(/\/$/, '') === '/admin'
const notice = ref('')
const storedSession = localStorage.getItem('ndfDealerSession')
const currentDealer = ref<Dealer | null>(storedSession ? JSON.parse(storedSession) : null)

const registerForm = reactive<Dealer>({
  company: '', official: '', taxNumber: '', city: '', phone: '', email: '', password: '', discountPercent: 0,
})
const passwordAgain = ref('')
const termsAccepted = ref(false)
const loginForm = reactive({ email: '', password: '', remember: false })
const search = ref('')
const selectedCategory = ref('Tümü')
const cart = reactive<Record<number, number>>({})
const activeTab = ref<'products' | 'orders' | 'payments' | 'profile' | 'online-payment'>('products')
const paymentNotice = ref('')
const paymentAmount = ref<number | null>(null)
const paymentCurrency = ref<'TRY' | 'USD'>('TRY')
const cardForm = reactive({ holder: '', number: '', expiry: '', cvc: '', installment: 'Tek çekim' })
const orderNote = ref('')
const orders = ref<Order[]>([])
const currentPage = ref(1)
const pageSize = 24
const usdToTry = 47.7364
const eurToTry = 55.75
const catalogCurrency = ref<'TRY' | 'USD' | 'EUR'>('TRY')
const sortOrder = ref<'recommended' | 'price-asc' | 'price-desc'>('recommended')
const selectedProduct = ref<CatalogProduct | null>(null)
const detailQuantity = ref(1)
const categories = ['Tümü', ...new Set(products.map((product) => product.category))]
const filteredProducts = computed(() => products.filter((product) =>
  (selectedCategory.value === 'Tümü' || product.category === selectedCategory.value)
  && product.name.toLocaleLowerCase('tr').includes(search.value.toLocaleLowerCase('tr')),
))
const sortedProducts = computed(() => {
  const result = [...filteredProducts.value]
  if (sortOrder.value === 'price-asc') result.sort((a, b) => a.price - b.price)
  if (sortOrder.value === 'price-desc') result.sort((a, b) => b.price - a.price)
  return result
})
const pageCount = computed(() => Math.max(1, Math.ceil(filteredProducts.value.length / pageSize)))
const pagedProducts = computed(() => sortedProducts.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize))
const cartCount = computed(() => Object.values(cart).reduce((sum, count) => sum + count, 0))
const discountedPrice = (price: number) => price * (1 - (currentDealer.value?.discountPercent || 0) / 100)
const cartTotal = computed(() => products.reduce((sum, product) => sum + discountedPrice(product.price) * usdToTry * (cart[product.id] || 0), 0))
const money = (value: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(value)
const dollar = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
const euro = (value: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
const productPrice = (usdPrice: number) => {
  const discountedUsd = discountedPrice(usdPrice)
  if (catalogCurrency.value === 'TRY') return money(discountedUsd * usdToTry)
  if (catalogCurrency.value === 'EUR') return euro(discountedUsd * usdToTry / eurToTry)
  return dollar(discountedUsd)
}
const alternatePrice = (usdPrice: number) => catalogCurrency.value === 'TRY'
  ? dollar(discountedPrice(usdPrice))
  : money(discountedPrice(usdPrice) * usdToTry)
function clearCart() {
  Object.keys(cart).forEach((id) => delete cart[Number(id)])
}
function addToCart(id: number) {
  cart[id] = (cart[id] || 0) + 1
}
function openProduct(product: CatalogProduct) {
  selectedProduct.value = product
  detailQuantity.value = 1
}
function addSelectedProduct() {
  if (!selectedProduct.value) return
  cart[selectedProduct.value.id] = (cart[selectedProduct.value.id] || 0) + detailQuantity.value
  selectedProduct.value = null
}
function formatExpiry(event: Event) {
  const input = event.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '').slice(0, 4)
  cardForm.expiry = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}
function formatCardNumber(event: Event) {
  const input = event.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '').slice(0, 16)
  cardForm.number = digits.replace(/(.{4})/g, '$1 ').trim()
}
function applyAuth(auth: AuthDto) {
  const dealer: Dealer = { id: auth.dealer.id, company: auth.dealer.company, official: auth.dealer.official, taxNumber: auth.dealer.tax_number, city: auth.dealer.city, phone: auth.dealer.phone, email: auth.dealer.email, password: '', discountPercent: Number(auth.dealer.discount_percent || 0) }
  currentDealer.value = dealer
  localStorage.setItem('ndfAccessToken', auth.access_token)
  localStorage.setItem('ndfDealerSession', JSON.stringify(dealer))
}
onMounted(async () => {
  if (!localStorage.getItem('ndfAccessToken') || !currentDealer.value) return
  try {
    const dealer = await api.me()
    currentDealer.value.discountPercent = Number(dealer.discount_percent || 0)
    localStorage.setItem('ndfDealerSession', JSON.stringify(currentDealer.value))
  } catch { /* Oturum denetimi diğer korumalı işlemlerde yapılır. */ }
})
function mapOrder(order: OrderDto): Order {
  return { id: order.order_number, date: new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(new Date(order.created_at)), itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0), total: Number(order.total_try), status: 'Hazırlanıyor', note: order.note }
}
async function openTab(tab: typeof activeTab.value) {
  activeTab.value = tab
  paymentNotice.value = ''
  if (tab === 'orders' && localStorage.getItem('ndfAccessToken')) {
    try { orders.value = (await api.orders()).map(mapOrder) } catch { /* UI mevcut veriyi korur */ }
  }
}
async function pay() {
  if (!cartCount.value) return void (paymentNotice.value = 'Ödeme yapabilmek için önce sepetinize ürün ekleyin.')
  try {
    const created = await api.createOrder(Object.entries(cart).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => ({ product_id: Number(id), quantity })), orderNote.value)
    orders.value.unshift(mapOrder(created))
    clearCart()
    orderNote.value = ''
    paymentNotice.value = 'Siparişiniz başarıyla oluşturuldu.'
  } catch (error) {
    paymentNotice.value = error instanceof ApiError ? error.message : 'Backend bağlantısı kurulamadı.'
    if (error instanceof ApiError && error.status === 401) {
      localStorage.removeItem('ndfAccessToken')
      localStorage.removeItem('ndfDealerSession')
      currentDealer.value = null
      setTimeout(() => openView('login'), 1200)
    }
  }
}
function payOnline() {
  if (!paymentAmount.value || paymentAmount.value <= 0) return void (paymentNotice.value = 'Lütfen geçerli bir ödeme tutarı girin.')
  if (!orderNote.value) return void (paymentNotice.value = 'Lütfen aldığınız ürünü sipariş notuna yazın.')
  const formattedAmount = paymentCurrency.value === 'TRY' ? money(paymentAmount.value) : dollar(paymentAmount.value)
  paymentNotice.value = `${formattedAmount} tutarındaki ödeme bilgileriniz hazırlandı.`
}

const title = computed(() => ({
  home: '', register: 'Bayi Kayıt Başvurusu', login: 'Bayi Girişi', account: 'Bayi Paneli',
}[view.value]))

function openView(next: View) {
  notice.value = ''
  view.value = next
  requestAnimationFrame(() => document.querySelector('.auth-section')?.scrollIntoView({ behavior: 'smooth' }))
}

async function register() {
  notice.value = ''
  if (registerForm.password.length < 8) return void (notice.value = 'Şifreniz en az 8 karakter olmalıdır.')
  if (registerForm.password !== passwordAgain.value) return void (notice.value = 'Şifreler birbiriyle eşleşmiyor.')
  if (!termsAccepted.value) return void (notice.value = 'Devam etmek için kullanım koşullarını kabul edin.')

  try {
    const auth = await api.register({ company: registerForm.company, official: registerForm.official, tax_number: registerForm.taxNumber, city: registerForm.city, phone: registerForm.phone, email: registerForm.email, password: registerForm.password })
    applyAuth(auth)
    notice.value = ''
    view.value = 'account'
  } catch (error) {
    notice.value = error instanceof ApiError ? error.message : 'Backend bağlantısı kurulamadı.'
  }
}

async function login() {
  try {
    applyAuth(await api.login(loginForm.email, loginForm.password))
    notice.value = ''
    view.value = 'account'
  } catch (error) {
    notice.value = error instanceof ApiError ? error.message : 'Backend bağlantısı kurulamadı.'
  }
}

function logout() {
  currentDealer.value = null
  localStorage.removeItem('ndfDealerSession')
  localStorage.removeItem('ndfAccessToken')
  loginForm.password = ''
  view.value = 'home'
}
</script>

<template>
  <AdminPanel v-if="isAdminPage" />
  <main v-else class="page">
    <section v-if="view !== 'account'" class="hero" :style="{ backgroundImage: `url(${heroBg})` }">
      <div class="hero-overlay"></div>
      <div class="top-contact"><a href="tel:+902242161514">☎ +90 (224) 216 15 14</a><span>Fax: +90 (224) 216 14 16</span></div>
      <div class="hero-content">
        <img :src="ndfLogo" alt="NDF Makina" class="main-logo" />
        <h1>TARIM VE BAHÇE MAKİNELERİ</h1><p>Güçlü • Dayanıklı • Verimli</p>
      </div>
    </section>

    <section v-if="view === 'home'" class="dealer-section">
      <button class="dealer-box" @click="openView('register')"><span class="dealer-icon">✎</span><strong>BAYİ KAYIT</strong><small>Yeni bayi kaydı oluştur</small></button>
      <div class="divider"></div>
      <button class="dealer-box" @click="openView(currentDealer ? 'account' : 'login')"><span class="dealer-icon">◯</span><strong>{{ currentDealer ? 'BAYİ PANELİ' : 'BAYİ GİRİŞ' }}</strong><small>{{ currentDealer ? 'Hesabınızı görüntüleyin' : 'Bayi hesabına giriş yap' }}</small></button>
    </section>

    <section v-else class="auth-section">
      <button v-if="view !== 'account'" class="back" type="button" @click="view = 'home'">← Ana sayfaya dön</button>
      <div v-if="view !== 'account'" class="auth-card">
        <aside class="auth-brand">
          <img :src="ndfLogo" alt="NDF" />
          <span class="brand-kicker">NDF BAYİ PORTALI</span>
          <h3>İşinizi birlikte<br />daha ileri taşıyalım.</h3>
          <p>NDF bayi ağına katılın; ürünlere, duyurulara ve bayi ayrıcalıklarına tek noktadan ulaşın.</p>
          <ul><li><span>✓</span> Hızlı ve kolay başvuru</li><li><span>✓</span> Size özel bayi hesabı</li><li><span>✓</span> Güvenilir iş ortaklığı</li></ul>
        </aside>
        <div class="auth-content">
        <div class="auth-heading"><span class="auth-icon">{{ view === 'register' ? '✎' : view === 'login' ? '↗' : '✓' }}</span><div><span class="eyebrow">{{ view === 'register' ? 'YENİ BAŞVURU' : view === 'login' ? 'TEKRAR HOŞ GELDİNİZ' : 'HESABINIZ' }}</span><h2>{{ title }}</h2><p v-if="view === 'register'">Bilgilerinizi eksiksiz doldurarak başvurunuzu oluşturun.</p><p v-else-if="view === 'login'">Hesabınıza devam etmek için bilgilerinizi girin.</p></div></div>

        <form v-if="view === 'register'" class="form-grid" @submit.prevent="register">
          <label>Firma unvanı<input v-model.trim="registerForm.company" required placeholder="Firma unvanınız" /></label>
          <label>Yetkili ad soyad<input v-model.trim="registerForm.official" required placeholder="Ad Soyad" /></label>
          <label>Vergi numarası<input v-model.trim="registerForm.taxNumber" required inputmode="numeric" pattern="[0-9]{10,11}" placeholder="10 veya 11 hane" /></label>
          <label>Şehir<select v-model="registerForm.city" required><option value="" disabled>Şehir seçin</option><option>Bursa</option><option>İstanbul</option><option>Ankara</option><option>İzmir</option><option>Antalya</option><option>Diğer</option></select></label>
          <label>Telefon<input v-model.trim="registerForm.phone" required type="tel" placeholder="05__ ___ __ __" /></label>
          <label>E-posta<input v-model.trim="registerForm.email" required type="email" placeholder="ornek@firma.com" /></label>
          <label>Şifre<input v-model="registerForm.password" required type="password" minlength="8" placeholder="En az 8 karakter" /></label>
          <label>Şifre tekrar<input v-model="passwordAgain" required type="password" placeholder="Şifrenizi tekrar girin" /></label>
          <label class="check full"><input v-model="termsAccepted" type="checkbox" /> Bilgilerimin bayi başvurusu için işlenmesini kabul ediyorum.</label>
          <p v-if="notice" class="notice error full">{{ notice }}</p>
          <button class="submit full" type="submit">BAYİ KAYDI OLUŞTUR <span>→</span></button>
          <p class="switch full">Zaten hesabınız var mı? <button type="button" @click="openView('login')">Giriş yapın</button></p>
        </form>

        <form v-else-if="view === 'login'" class="login-form" @submit.prevent="login">
          <p v-if="notice" :class="['notice', notice.includes('başarıyla') ? 'success' : 'error']">{{ notice }}</p>
          <label>E-posta<input v-model.trim="loginForm.email" required type="email" placeholder="ornek@firma.com" /></label>
          <label>Şifre<input v-model="loginForm.password" required type="password" placeholder="Şifreniz" /></label>
          <label class="check"><input v-model="loginForm.remember" type="checkbox" /> Beni hatırla</label>
          <button class="submit" type="submit">GİRİŞ YAP <span>→</span></button>
          <p class="switch">Bayi hesabınız yok mu? <button type="button" @click="openView('register')">Kayıt oluşturun</button></p>
        </form>

        </div>
      </div>
      <section v-if="view === 'account' && currentDealer" class="dealer-portal">
        <div v-if="activeTab === 'products'" class="shipping-strip"><strong>Ücretsiz Sevkiyat</strong><span>— 50.000 ₺ üzeri bayi siparişlerinizde ücretsiz sevkiyat</span></div>
        <header class="portal-header">
          <button class="portal-logo" @click="view = 'account'"><img :src="ndfLogo" alt="NDF" /><span>BAYİ PORTALI</span></button>
          <nav><button :class="{ active: activeTab === 'products' }" @click="openTab('products')">Ürünler</button><button :class="{ active: activeTab === 'orders' }" @click="openTab('orders')">Siparişlerim</button><button :class="{ active: activeTab === 'payments' }" @click="openTab('payments')">Sepet Ödemesi</button><button :class="{ active: activeTab === 'profile' }" @click="openTab('profile')">Firma Profili</button><button :class="{ active: activeTab === 'online-payment' }" @click="openTab('online-payment')">Online Ödeme</button></nav>
          <div class="portal-user"><span>{{ currentDealer.official.charAt(0).toUpperCase() }}</span><div><strong>{{ currentDealer.official }}</strong><small>{{ currentDealer.company }}</small></div><button title="Çıkış yap" @click="logout">↪</button></div>
        </header>
        <div v-if="activeTab === 'products'" class="shop-toolbar">
          <div><span class="shop-kicker">NDF BAYİ MAĞAZASI</span><h2>Ürünler</h2><p>İhtiyacınız olan ürünü bulun, bayi sepetinizi kolayca oluşturun.</p></div>
          <button class="cart-box" @click="openTab('payments')"><span class="cart-symbol">🛒<b>{{ cartCount }}</b></span><div><small>SEPET TOPLAMI</small><strong>{{ money(cartTotal) }}</strong></div><span class="cart-go">→</span></button>
        </div>
        <section v-if="activeTab === 'products'" class="campaign-slider" :style="{ backgroundImage: `linear-gradient(90deg,rgba(4,18,49,.96) 0%,rgba(5,30,72,.76) 42%,rgba(10,37,78,.08) 75%),url(${heroBg})` }">
          <button class="slider-arrow left" aria-label="Önceki kampanya">‹</button>
          <div class="campaign-copy"><span>NDF PROFESYONEL SERİ</span><h2>TOPRAĞIN GÜCÜNÜ<br /><b>HAREKETE GEÇİRİN</b></h2><p>Yüksek performanslı tarım ve bahçe makinelerinde<br />bayilere özel avantajlı fiyatlar.</p><div><button @click="selectedCategory = 'Çapa Makinaları'">ÜRÜNLERİ İNCELE</button><small>Güçlü • Dayanıklı • Verimli</small></div></div>
          <button class="slider-arrow right" aria-label="Sonraki kampanya">›</button>
          <div class="slider-dots"><i></i><i class="active"></i><i></i></div>
        </section>
        <div v-if="activeTab === 'products'" class="search-bar"><span>⌕</span><input v-model="search" placeholder="Ürün adı ile arayın..." @input="currentPage = 1" /><select v-model="selectedCategory" @change="currentPage = 1"><option v-for="category in categories" :key="category">{{ category }}</option></select><button>ARA</button></div>
        <div v-if="activeTab === 'products'" class="shop-layout">
          <aside class="categories"><h3>Kategoriler</h3><div class="category-list"><button v-for="category in categories" :key="category" :class="{ active: selectedCategory === category }" @click="selectedCategory = category; currentPage = 1"><span>{{ category }}</span><b>›</b></button></div><div class="category-hint"><span>↕</span> Kaydırarak tüm kategorileri görün</div><div class="support"><span>☎</span><strong>Yardıma mı ihtiyacınız var?</strong><small>+90 (224) 216 15 14</small></div></aside>
          <div class="product-area">
            <div class="result-line"><span><strong>{{ filteredProducts.length }}</strong> üründen {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, filteredProducts.length) }} arası gösteriliyor</span><div class="catalog-tools"><div class="currency-toggle"><button :class="{ active: catalogCurrency === 'TRY' }" @click="catalogCurrency = 'TRY'">₺ TL</button><button :class="{ active: catalogCurrency === 'USD' }" @click="catalogCurrency = 'USD'">$ Dolar</button><button :class="{ active: catalogCurrency === 'EUR' }" @click="catalogCurrency = 'EUR'">€ Euro</button></div><select v-model="sortOrder" @change="currentPage = 1"><option value="recommended">Önerilen sıralama</option><option value="price-asc">Fiyat: Artan</option><option value="price-desc">Fiyat: Azalan</option></select></div></div>
            <div class="product-grid">
              <article v-for="product in pagedProducts" :key="product.id" class="product-card">
                <button class="product-image" type="button" @click="openProduct(product)" :aria-label="`${product.name} detayını aç`" :style="{ backgroundImage: product.image ? `url(${product.image})` : `url(${heroBg})` }"><span>Stokta</span></button>
                <div class="product-info"><small>{{ product.category }}</small><h3 class="product-name" @click="openProduct(product)">{{ product.name }}</h3><div class="price">{{ productPrice(product.price) }}</div><div class="alternate-price">≈ {{ alternatePrice(product.price) }}</div><button class="add-cart" @click="addToCart(product.id)">＋ SEPETE EKLE</button></div>
              </article>
            </div>
            <div v-if="!filteredProducts.length" class="empty-products">Aramanızla eşleşen ürün bulunamadı.</div>
            <div v-if="pageCount > 1" class="catalog-pagination"><button :disabled="currentPage === 1" @click="currentPage--">←</button><span>{{ currentPage }} / {{ pageCount }}</span><button :disabled="currentPage === pageCount" @click="currentPage++">→</button></div>
          </div>
        </div>

        <section v-else-if="activeTab === 'orders'" class="portal-page">
          <div class="page-title"><div><span>SİPARİŞ YÖNETİMİ</span><h2>Siparişlerim</h2><p>Geçmiş ve güncel bayi siparişlerinizi buradan takip edin.</p></div><button @click="openTab('products')">＋ Yeni sipariş oluştur</button></div>
          <div class="order-filters"><button class="active">Tümü <b>{{ orders.length + (cartCount ? 1 : 0) }}</b></button><button>Sepette <b>{{ cartCount ? 1 : 0 }}</b></button><button>Hazırlanıyor <b>{{ orders.length }}</b></button><button>Tamamlandı <b>0</b></button></div>
          <div v-if="cartCount" class="cart-draft">
            <div class="draft-heading"><div><span>▤</span><p><small>SİPARİŞ TASLAĞI</small><strong>Sepetiniz ödeme bekliyor</strong></p></div><div class="draft-status">Ödeme Bekliyor</div></div>
            <div class="draft-products"><div v-for="product in products.filter(p => cart[p.id])" :key="product.id"><img :src="product.image || heroBg" :alt="product.name" /><p><strong>{{ product.name }}</strong><small>{{ cart[product.id] || 0 }} adet × {{ money(discountedPrice(product.price) * usdToTry) }}</small></p><b>{{ money(discountedPrice(product.price) * usdToTry * (cart[product.id] || 0)) }}</b></div></div>
            <div class="draft-footer"><p><small>SEPET TOPLAMI</small><strong>{{ money(cartTotal) }}</strong></p><button @click="openTab('payments')">Ödemeye devam et <span>→</span></button></div>
          </div>
          <div v-if="orders.length" class="orders-table">
            <div class="table-head"><span>Sipariş No</span><span>Tarih</span><span>Ürün</span><span>Tutar</span><span>Durum</span><span></span></div>
            <div v-for="order in orders" :key="order.id"><strong>#{{ order.id }}</strong><span>{{ order.date }}</span><span>{{ order.itemCount }} ürün</span><strong>{{ money(order.total) }}</strong><em class="status preparing">{{ order.status }}</em><button>Detay →</button></div>
          </div>
          <div v-if="!orders.length && !cartCount" class="empty-orders">
            <div class="empty-orb"><span>▤</span><i></i><i></i></div>
            <span class="empty-kicker">SİPARİŞ MERKEZİ</span><h3>Henüz siparişiniz yok</h3><p>İhtiyacınız olan NDF ürünlerini seçin, sepetinizi oluşturun ve güvenli ödeme ile siparişinizi tamamlayın.</p>
            <button @click="openTab('products')"><span>＋</span> Ürünleri keşfet <b>→</b></button>
            <div class="order-steps"><div><span>1</span><p><strong>Ürünleri seçin</strong><small>Kataloğu inceleyin</small></p></div><i></i><div><span>2</span><p><strong>Sepeti onaylayın</strong><small>Adetleri belirleyin</small></p></div><i></i><div><span>3</span><p><strong>Siparişi takip edin</strong><small>Durumu anlık görün</small></p></div></div>
          </div>
        </section>

        <section v-else-if="activeTab === 'payments'" class="portal-page">
          <div class="page-title"><div><span>GÜVENLİ ÖDEME</span><h2>Kart ile Ödeme</h2><p>Siparişinizi banka veya kredi kartınızla güvenle tamamlayın.</p></div><div class="secure-badge">🔒 256-bit güvenli ödeme</div></div>
          <div class="payment-layout">
            <form class="payment-card" @submit.prevent="pay">
              <div class="credit-card"><div class="card-top"><span>NDF</span><b>••••</b></div><i></i><strong>{{ cardForm.number || '•••• •••• •••• ••••' }}</strong><div><span><small>KART SAHİBİ</small>{{ cardForm.holder || 'AD SOYAD' }}</span><span><small>SON KULLANMA</small>{{ cardForm.expiry || 'AA/YY' }}</span></div></div>
              <h3>Kart Bilgileri</h3>
              <label>Kart üzerindeki isim<input v-model="cardForm.holder" required placeholder="Ad Soyad" /></label>
              <label>Kart numarası<input :value="cardForm.number" required maxlength="19" inputmode="numeric" autocomplete="cc-number" pattern="\d{4} \d{4} \d{4} \d{4}" placeholder="0000 0000 0000 0000" @input="formatCardNumber" /></label>
              <div class="card-row"><label>Son kullanma<input :value="cardForm.expiry" required maxlength="5" inputmode="numeric" pattern="(0[1-9]|1[0-2])/\d{2}" title="AA/YY formatında geçerli bir tarih girin" placeholder="AA/YY" @input="formatExpiry" /></label><label>CVC<input v-model="cardForm.cvc" required maxlength="3" type="password" inputmode="numeric" placeholder="•••" /></label></div>
              <label>Taksit seçeneği<select v-model="cardForm.installment"><option>Tek çekim</option><option>2 taksit</option><option>3 taksit</option><option>6 taksit</option></select></label>
              <p v-if="paymentNotice" :class="['notice', paymentNotice.includes('başarıyla') ? 'success' : 'error']">{{ paymentNotice }}</p>
              <button class="pay-button" type="submit">🔒 {{ money(cartTotal) }} GÜVENLE ÖDE</button>
            </form>
            <aside class="payment-summary"><div class="summary-heading"><h3>Sipariş Özeti</h3><span v-if="cartCount">{{ cartCount }} ürün</span></div><div v-if="cartCount" class="summary-products"><div v-for="product in products.filter(p => cart[p.id])" :key="product.id"><span>{{ cart[product.id] }}×</span><p><strong>{{ product.name }}</strong><small>{{ money(discountedPrice(product.price) * usdToTry) }}</small></p></div></div><div v-else class="empty-cart">🛒<strong>Sepetiniz boş</strong><button @click="openTab('products')">Ürünlere göz at</button></div><dl><div><dt>Ara toplam</dt><dd>{{ money(cartTotal) }}</dd></div><div><dt>KDV</dt><dd>Fiyata dahil</dd></div><div class="summary-total"><dt>Toplam</dt><dd>{{ money(cartTotal) }}</dd></div></dl><p class="payment-note">🔐 Kart bilgileriniz sistemimizde saklanmaz.</p></aside>
          </div>
        </section>

        <section v-else-if="activeTab === 'profile'" class="portal-page">
          <div class="page-title"><div><span>BAYİ HESABI</span><h2>Firma Profili</h2><p>Firma ve iletişim bilgilerinizi görüntüleyin.</p></div><button>Bilgileri düzenle</button></div>
          <div class="profile-layout"><div class="profile-company"><span>{{ currentDealer.company.charAt(0).toUpperCase() }}</span><h3>{{ currentDealer.company }}</h3><p>Onaylı NDF Bayisi</p><em>✓ Aktif hesap</em></div><div class="profile-details"><h3>Firma Bilgileri</h3><dl><div><dt>Firma unvanı</dt><dd>{{ currentDealer.company }}</dd></div><div><dt>Yetkili kişi</dt><dd>{{ currentDealer.official }}</dd></div><div><dt>E-posta</dt><dd>{{ currentDealer.email }}</dd></div><div><dt>Telefon</dt><dd>{{ currentDealer.phone }}</dd></div><div><dt>Şehir</dt><dd>{{ currentDealer.city }}</dd></div><div><dt>Vergi numarası</dt><dd>{{ currentDealer.taxNumber }}</dd></div></dl></div></div>
        </section>

        <section v-else class="portal-page online-payment-page">
          <div class="page-title"><div><span>BAĞIMSIZ ÖDEME</span><h2>Online Ödeme</h2><p>Mağazadan aldığınız ürün için tutarı ve açıklamayı kendiniz girin.</p></div><div class="secure-badge">🔒 Güvenli ödeme</div></div>
          <form class="payment-card online-payment-card" @submit.prevent="payOnline">
            <div class="payment-details"><h3>Ödeme Bilgileri</h3><div><label>Ödeme tutarı ({{ paymentCurrency === 'TRY' ? 'TL' : 'USD' }})<span class="amount-input"><input v-model.number="paymentAmount" required type="number" min="1" step="0.01" inputmode="decimal" :placeholder="paymentCurrency === 'TRY' ? '₺0,00' : '$0.00'" /><select v-model="paymentCurrency" aria-label="Para birimi"><option value="TRY">₺ TL</option><option value="USD">$ Dolar</option></select></span></label><label>Sipariş notu<input v-model.trim="orderNote" required maxlength="250" placeholder="Aldığınız ürünü yazın" /></label></div></div>
            <h3>Kart Bilgileri</h3>
            <label>Kart üzerindeki isim<input v-model="cardForm.holder" required placeholder="Ad Soyad" /></label>
            <label>Kart numarası<input :value="cardForm.number" required maxlength="19" inputmode="numeric" autocomplete="cc-number" pattern="\d{4} \d{4} \d{4} \d{4}" placeholder="0000 0000 0000 0000" @input="formatCardNumber" /></label>
            <div class="card-row"><label>Son kullanma<input :value="cardForm.expiry" required maxlength="5" inputmode="numeric" placeholder="AA/YY" @input="formatExpiry" /></label><label>CVC<input v-model="cardForm.cvc" required maxlength="3" type="password" inputmode="numeric" placeholder="•••" /></label></div>
            <p v-if="paymentNotice" class="notice">{{ paymentNotice }}</p>
            <button class="pay-button" type="submit">🔒 {{ paymentAmount ? (paymentCurrency === 'TRY' ? money(paymentAmount) : dollar(paymentAmount)) : 'ÖDEME YAP' }}</button>
          </form>
        </section>
      </section>
    </section>

    <section v-if="view !== 'account'" class="contact"><h2>İLETİŞİM</h2><div class="contact-info"><div><strong>Adres</strong><p>Altınova Mh. Sulu Sk. No:16<br />Osmangazi / BURSA</p></div><div><strong>Telefon</strong><p>+90 (224) 216 15 14<br />Fax: +90 (224) 216 14 16</p></div><div><strong>E-Mail</strong><p><a href="mailto:ndfmakina@hotmail.com">ndfmakina@hotmail.com</a></p></div></div></section>
    <div v-if="selectedProduct" class="product-modal" @click.self="selectedProduct = null">
      <section class="product-detail" role="dialog" aria-modal="true" :aria-label="selectedProduct.name">
        <button class="detail-close" type="button" aria-label="Kapat" @click="selectedProduct = null">×</button>
        <div class="detail-image"><img :src="selectedProduct.image || heroBg" :alt="selectedProduct.name" /></div>
        <div class="detail-content">
          <small>ÜRÜN DETAYI</small><h2>{{ selectedProduct.name }}</h2>
          <div class="detail-price">{{ productPrice(selectedProduct.price) }}</div><div class="alternate-price">≈ {{ alternatePrice(selectedProduct.price) }}</div>
          <div class="detail-stock">✓ Stokta</div>
          <div class="detail-actions"><div class="quantity"><button @click="detailQuantity = Math.max(1, detailQuantity - 1)">−</button><span>{{ detailQuantity }}</span><button @click="detailQuantity++">＋</button></div><button class="detail-cart" @click="addSelectedProduct">SEPETE EKLE</button></div>
          <p><strong>Kategori:</strong> {{ selectedProduct.category }}</p>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
*{box-sizing:border-box}.page{min-height:100vh;background:#fff;color:#172e6a;font-family:Arial,Helvetica,sans-serif}.hero{width:calc(100% - 30px);height:380px;margin:10px auto 25px;position:relative;background-size:cover;background-position:center;border-radius:12px;overflow:hidden;display:flex;justify-content:center;align-items:center}.hero-overlay{position:absolute;inset:0;background:linear-gradient(rgba(12,34,82,.3),rgba(12,34,82,.55))}.top-contact{position:absolute;top:20px;right:40px;z-index:3;display:flex;flex-direction:column;align-items:flex-end;gap:6px;color:#fff;font-size:14px}.top-contact a{color:#fff;font-weight:700;text-decoration:none;font-size:16px}.hero-content{position:relative;z-index:2;text-align:center;color:#fff}.main-logo{width:310px;max-width:70%;margin-bottom:18px}.hero h1{margin:0;color:#fff;font-size:28px;letter-spacing:1px}.hero p{font-size:18px}.dealer-section{width:60%;max-width:900px;margin:70px auto;display:grid;grid-template-columns:1fr 50px 1fr;align-items:center}.dealer-box{height:160px;border:1px solid #d7ddea;background:#fafbfe;display:flex;flex-direction:column;justify-content:center;align-items:center;cursor:pointer;color:#172e6a;transition:.25s}.dealer-box:hover{background:#294587;color:#fff;transform:translateY(-3px);box-shadow:0 12px 26px #172e6a26}.dealer-icon{font-size:38px;margin-bottom:15px}.dealer-box strong{font-size:20px}.dealer-box small{margin-top:10px;font-size:14px;color:#666}.dealer-box:hover small{color:#fff}.divider{width:2px;height:110px;background:#24428a;justify-self:center}.auth-section{max-width:960px;margin:55px auto 80px;padding:0 20px}.back{border:0;background:none;color:#294587;font-weight:700;cursor:pointer;margin-bottom:18px}.auth-card{background:#fff;border:1px solid #d7ddea;border-top:5px solid #294587;border-radius:8px;padding:38px 44px;box-shadow:0 18px 50px #172e6a14}.auth-heading{display:flex;align-items:center;gap:18px;padding-bottom:25px;margin-bottom:28px;border-bottom:1px solid #e4e8f0}.auth-heading h2{margin:0 0 7px;font-size:27px}.auth-heading p{margin:0;color:#697386}.auth-icon{display:grid;place-items:center;width:54px;height:54px;border-radius:50%;background:#eef2fb;font-size:28px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px 24px}.full{grid-column:1/-1}label{display:flex;flex-direction:column;gap:8px;font-size:14px;font-weight:700;color:#29395e}input,select{width:100%;height:48px;border:1px solid #ccd4e2;border-radius:5px;padding:0 14px;font:inherit;color:#25365c;background:#fff;outline:none}input:focus,select:focus{border-color:#294587;box-shadow:0 0 0 3px #29458716}.check{flex-direction:row;align-items:center;font-weight:400;color:#59657b}.check input{width:17px;height:17px;accent-color:#294587}.submit{height:50px;border:0;border-radius:5px;background:#294587;color:#fff;font-weight:700;letter-spacing:.4px;cursor:pointer;transition:.2s}.submit:hover{background:#172e6a}.submit span{float:right;margin-right:16px}.switch{text-align:center;color:#6b7280;font-size:14px}.switch button{border:0;background:none;color:#294587;font-weight:700;cursor:pointer}.notice{padding:12px 15px;border-radius:5px;font-size:14px}.error{background:#fff1f1;color:#a32929}.success{background:#eaf8ef;color:#287a45}.login-form{max-width:490px;margin:auto;display:grid;gap:20px}.account{text-align:center}.welcome{display:grid;place-items:center;width:70px;height:70px;margin:auto;border-radius:50%;background:#eaf8ef;color:#287a45;font-size:32px}.account h3{font-size:24px;margin-bottom:7px}.account>p{color:#687386}.account dl{max-width:600px;margin:28px auto;display:grid;grid-template-columns:1fr 1fr;text-align:left;border:1px solid #e1e5ed;border-radius:7px;overflow:hidden}.account dl div{padding:16px;border-bottom:1px solid #e1e5ed}.account dt{font-size:12px;color:#7a8497}.account dd{margin:5px 0 0;font-weight:700}.account .submit{width:220px}.contact{padding:55px 20px;background:#f5f7fb;text-align:center}.contact h2{margin:0 0 35px}.contact-info{max-width:950px;margin:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:30px}.contact-info p{color:#666;line-height:1.7}.contact-info a{color:#294587;text-decoration:none}@media(max-width:800px){.hero{height:300px}.top-contact{right:20px}.main-logo{width:240px}.hero h1{font-size:20px}.dealer-section{width:90%;display:flex;flex-direction:column;gap:20px}.dealer-box{width:100%}.divider{width:80%;height:2px}.auth-card{padding:28px 20px}.form-grid,.account dl,.contact-info{grid-template-columns:1fr}.full{grid-column:auto}.hero-content p{font-size:14px}.top-contact{font-size:11px}.top-contact a{font-size:13px}}
/* Modern bayi giriş alanı */
.auth-section{max-width:1180px;position:relative;margin-top:70px}.auth-section::before{content:"";position:absolute;z-index:0;width:240px;height:240px;left:-70px;top:30px;border-radius:50%;background:#2f5edb12;filter:blur(2px)}.back{position:relative;z-index:1;display:inline-flex;align-items:center;padding:10px 14px;border-radius:10px;background:#f0f4fb;transition:.2s}.back:hover{background:#e3ebf8;transform:translateX(-3px)}.auth-card{position:relative;z-index:1;display:grid;grid-template-columns:340px minmax(0,1fr);padding:0;border:0;border-radius:24px;overflow:hidden;box-shadow:0 30px 80px #0d255329,0 4px 16px #0d255312}.auth-brand{position:relative;overflow:hidden;padding:45px 36px;background:linear-gradient(145deg,#0f285d 0%,#214a9d 68%,#2d63cb 100%);color:#fff}.auth-brand::before,.auth-brand::after{content:"";position:absolute;border:1px solid #ffffff18;border-radius:50%}.auth-brand::before{width:280px;height:280px;right:-160px;bottom:-80px}.auth-brand::after{width:180px;height:180px;right:-100px;bottom:-30px}.auth-brand img{width:150px;max-height:82px;object-fit:contain;margin-bottom:46px;filter:drop-shadow(0 5px 10px #09153266)}.brand-kicker{display:block;margin-bottom:15px;color:#bcd1ff;font-size:11px;font-weight:800;letter-spacing:2px}.auth-brand h3{position:relative;margin:0 0 18px;color:#fff;font-size:28px;line-height:1.25}.auth-brand p{position:relative;color:#dbe6ff;font-size:14px;line-height:1.7}.auth-brand ul{position:relative;list-style:none;margin:32px 0 0;padding:0;display:grid;gap:14px;font-size:13px}.auth-brand li{display:flex;align-items:center;gap:10px}.auth-brand li span{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#ffffff1c;color:#9fd5ff}.auth-content{padding:44px 46px 38px;background:linear-gradient(180deg,#fff 0%,#fbfcff 100%)}.auth-heading{align-items:flex-start;padding-bottom:23px}.auth-icon{flex:0 0 auto;width:48px;height:48px;background:linear-gradient(145deg,#edf3ff,#dce7ff);color:#214a9d;font-size:21px;font-weight:800}.eyebrow{display:block;margin-bottom:7px;color:#3862b6;font-size:10px;font-weight:800;letter-spacing:1.6px}.auth-heading h2{font-size:29px;letter-spacing:-.5px}.auth-heading p{line-height:1.5;font-size:14px}.form-grid{gap:19px 20px}label{gap:9px;font-size:12px;letter-spacing:.15px}input,select{height:51px;border-color:#d9e0ec;border-radius:11px;padding:0 15px;background:#f9fbfe;transition:.2s}input:hover,select:hover{border-color:#aebbd2;background:#fff}input:focus,select:focus{background:#fff;border-color:#3862b6;box-shadow:0 0 0 4px #3862b619}.submit{height:53px;border-radius:11px;background:linear-gradient(110deg,#193a80,#315fb9);box-shadow:0 10px 22px #1c438233;transition:.25s}.submit:hover{background:linear-gradient(110deg,#122c65,#2752aa);transform:translateY(-2px);box-shadow:0 14px 28px #1c438244}.check{font-size:13px}.switch{margin:2px 0 0}.login-form{max-width:none;padding:8px 20px 4px}.login-form .submit{margin-top:5px}.notice{border-radius:10px}.account dl{border-radius:14px;background:#fff;box-shadow:0 8px 22px #172e6a0c}
@media(max-width:950px){.auth-card{grid-template-columns:280px 1fr}.auth-brand{padding:38px 28px}.auth-content{padding:38px 30px}.form-grid{grid-template-columns:1fr}.full{grid-column:auto}}
@media(max-width:700px){.auth-section{margin-top:38px;padding:0 14px}.auth-card{display:block;border-radius:18px}.auth-brand{padding:24px 24px 22px}.auth-brand img{width:105px;margin:0 0 18px}.auth-brand h3{font-size:21px;margin-bottom:8px}.auth-brand p,.auth-brand ul{display:none}.brand-kicker{margin-bottom:9px}.auth-content{padding:28px 20px}.auth-heading{gap:12px}.auth-heading h2{font-size:23px}.auth-heading p{font-size:13px}.auth-icon{width:42px;height:42px}.login-form{padding:0}}
/* Bayi mağaza paneli */
.auth-section:has(.dealer-portal){max-width:1380px;margin-top:28px}.dealer-portal{position:relative;z-index:2;background:#f5f7fb;border:1px solid #e2e7f0;border-radius:22px;overflow:hidden;box-shadow:0 24px 70px #172e6a17;color:#172e6a}.portal-header{min-height:76px;padding:0 25px;display:flex;align-items:center;gap:30px;background:#fff;border-bottom:1px solid #e3e8f0}.portal-logo{display:flex;align-items:center;gap:10px;border:0;background:none;color:#172e6a;font-size:11px;font-weight:800;letter-spacing:1px}.portal-logo img{width:72px;height:45px;object-fit:contain}.portal-header nav{align-self:stretch;display:flex;align-items:stretch;gap:4px;flex:1}.portal-header nav button{position:relative;padding:0 17px;border:0;background:none;color:#5e6a82;font-weight:700;cursor:pointer}.portal-header nav button:hover,.portal-header nav button.active{color:#1f4a9b}.portal-header nav button.active::after{content:"";position:absolute;left:14px;right:14px;bottom:0;height:3px;background:#2d62c2;border-radius:4px 4px 0 0}.portal-user{display:flex;align-items:center;gap:10px}.portal-user>span{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;background:#e8effc;color:#2451a6;font-weight:800}.portal-user div{display:flex;flex-direction:column;max-width:150px}.portal-user strong{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.portal-user small{margin-top:3px;color:#8690a3;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.portal-user button{border:0;background:#f1f4f9;border-radius:9px;width:34px;height:34px;color:#53617a;cursor:pointer}.shop-toolbar{padding:34px 38px 24px;display:flex;align-items:flex-end;justify-content:space-between;background:linear-gradient(120deg,#102d67,#2860bc);color:#fff}.shop-kicker{font-size:10px;font-weight:800;letter-spacing:2px;color:#a9c7ff}.shop-toolbar h2{margin:7px 0 5px;color:#fff;font-size:30px}.shop-toolbar p{margin:0;color:#dce8ff;font-size:13px}.cart-box{min-width:205px;display:flex;align-items:center;gap:16px;padding:14px 18px;border:1px solid #ffffff2e;border-radius:14px;background:#ffffff12}.cart-symbol{position:relative;font-size:27px}.cart-symbol b{position:absolute;right:-9px;top:-9px;display:grid;place-items:center;min-width:19px;height:19px;padding:0 4px;border-radius:10px;background:#28a7e8;color:#fff;font-size:10px}.cart-box div{display:flex;flex-direction:column}.cart-box small{font-size:9px;color:#bcd1fa}.cart-box strong{margin-top:4px;font-size:16px}.search-bar{margin:-1px 38px 0;transform:translateY(50%);height:58px;display:flex;align-items:center;background:#fff;border-radius:14px;box-shadow:0 10px 30px #172e6a1c;overflow:hidden}.search-bar>span{padding-left:20px;font-size:25px;color:#6e7c94}.search-bar input{height:100%;border:0;border-radius:0;background:#fff;box-shadow:none;font-size:14px}.search-bar select{width:205px;height:32px;border-width:0 0 0 1px;border-radius:0;background:#fff}.search-bar button{align-self:stretch;width:90px;border:0;background:#20a5df;color:#fff;font-weight:800;cursor:pointer}.shop-layout{display:grid;grid-template-columns:245px 1fr;gap:28px;padding:58px 38px 40px}.categories{background:#fff;border-radius:15px;padding:20px 15px;height:max-content;border:1px solid #e2e7ef}.categories h3{margin:4px 8px 18px;font-size:19px}.categories>button{width:100%;min-height:45px;padding:9px 12px;display:flex;align-items:center;justify-content:space-between;border:0;border-bottom:1px solid #edf0f5;background:#fff;color:#56627a;text-align:left;font-size:11px;font-weight:700;cursor:pointer;border-radius:7px}.categories>button:hover,.categories>button.active{background:#edf4ff;color:#204d9f}.categories>button b{font-size:18px}.support{margin-top:22px;padding:18px;display:flex;flex-direction:column;align-items:flex-start;border-radius:12px;background:#102d67;color:#fff}.support span{font-size:22px}.support strong{margin:9px 0 5px;font-size:11px}.support small{color:#bcd1fa}.result-line{min-height:44px;display:flex;justify-content:space-between;align-items:center;color:#6d788e;font-size:12px}.result-line select{width:190px;height:38px;background:#fff}.product-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.product-card{overflow:hidden;background:#fff;border:1px solid #e0e5ee;border-radius:14px;transition:.25s}.product-card:hover{transform:translateY(-5px);box-shadow:0 16px 34px #172e6a18}.product-image{position:relative;height:185px;background-size:cover;border-bottom:1px solid #edf0f5}.product-image span{position:absolute;top:12px;left:12px;padding:6px 8px;border-radius:6px;background:#ffffffeb;color:#287744;font-size:9px;font-weight:800}.product-info{padding:17px}.product-info>small{color:#20a5df;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px}.product-info h3{height:38px;margin:8px 0 12px;font-size:13px;line-height:1.45}.price{margin-bottom:14px;font-size:19px;font-weight:800;color:#102d67}.product-info button{width:100%;height:41px;border:1px solid #2859af;border-radius:8px;background:#fff;color:#2859af;font-size:11px;font-weight:800;cursor:pointer}.product-info button:hover{background:#2859af;color:#fff}.product-info button span{font-size:16px}.empty-products{padding:70px;text-align:center;background:#fff;border-radius:14px;color:#7a8497}
@media(max-width:1050px){.portal-header nav button{padding:0 8px;font-size:11px}.portal-user div{display:none}.product-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:750px){.auth-section:has(.dealer-portal){padding:0 8px}.portal-header{padding:10px 14px;flex-wrap:wrap;gap:8px}.portal-logo{flex:1}.portal-header nav{order:3;width:100%;overflow-x:auto;min-height:45px}.portal-header nav button{white-space:nowrap}.shop-toolbar{padding:26px 20px 48px;align-items:flex-start}.shop-toolbar p{display:none}.cart-box{min-width:auto;padding:10px}.cart-box div{display:none}.search-bar{margin:0 14px}.search-bar select{width:105px}.search-bar button{width:58px}.shop-layout{display:block;padding:52px 14px 24px}.categories{margin-bottom:22px}.categories>button:not(.active){display:none}.support{display:none}.product-grid{grid-template-columns:1fr}.product-image{height:220px}.result-line select{width:150px}.portal-user>span{display:none}}
/* Tam ekran modern portal düzeni */
.auth-section:has(.dealer-portal){max-width:none;width:100%;margin:0;padding:0;background:#f3f6fb}.auth-section:has(.dealer-portal)::before{display:none}.dealer-portal{min-height:100vh;border:0;border-radius:0;box-shadow:none;background:#f3f6fb}.portal-header{padding-left:max(28px,calc((100vw - 1370px)/2));padding-right:max(28px,calc((100vw - 1370px)/2));box-shadow:0 3px 16px #172e6a0b}.shop-toolbar{padding:42px max(38px,calc((100vw - 1370px)/2)) 62px;background:linear-gradient(120deg,#0d275c,#2458b0 70%,#217dc1)}.cart-box{backdrop-filter:blur(8px)}.portal-stats{position:relative;z-index:3;max-width:1370px;margin:-32px auto 22px;padding:0 38px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.portal-stats>div{display:flex;align-items:center;gap:13px;padding:17px 18px;background:#fff;border:1px solid #e3e8f0;border-radius:14px;box-shadow:0 8px 24px #172e6a0d}.stat-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;font-weight:900}.stat-icon.blue{background:#e7efff;color:#2959b3}.stat-icon.cyan{background:#e3f8ff;color:#1596c8}.stat-icon.violet{background:#f0eaff;color:#704cc4}.stat-icon.green{background:#e7f8ef;color:#258753}.portal-stats p{margin:0;display:flex;flex-direction:column}.portal-stats small{font-size:9px;color:#8892a5;text-transform:uppercase;letter-spacing:.5px}.portal-stats strong{margin-top:4px;font-size:16px}.dealer-portal .search-bar{max-width:1294px;margin:0 auto;transform:none}.dealer-portal .shop-layout{max-width:1370px;margin:0 auto;padding-top:30px}
@media(max-width:750px){.portal-stats{grid-template-columns:1fr 1fr;padding:0 14px;margin-top:-28px}.portal-stats>div{padding:12px}.stat-icon{width:32px;height:32px}.dealer-portal .search-bar{margin:0 14px}.dealer-portal .shop-layout{padding-top:24px}}
/* Portal alt sayfaları */
.portal-page{max-width:1370px;margin:0 auto;padding:46px 38px 70px}.page-title{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:28px}.page-title>div>span{font-size:10px;font-weight:800;letter-spacing:1.8px;color:#2e60b8}.page-title h2{margin:7px 0 6px;font-size:30px}.page-title p{margin:0;color:#788398;font-size:13px}.page-title>button{padding:13px 18px;border:0;border-radius:10px;background:#2859af;color:#fff;font-weight:700;cursor:pointer}.order-filters{display:flex;gap:7px;margin-bottom:17px}.order-filters button{padding:10px 14px;border:1px solid #dde3ec;border-radius:9px;background:#fff;color:#647087;font-weight:700;cursor:pointer}.order-filters button.active{background:#eaf1ff;color:#2757ab;border-color:#cbdafa}.order-filters b{display:inline-grid;place-items:center;min-width:19px;height:19px;margin-left:5px;border-radius:10px;background:#eef1f6;font-size:9px}.orders-table{overflow:hidden;border:1px solid #e0e5ed;border-radius:15px;background:#fff;box-shadow:0 10px 30px #172e6a0c}.orders-table>div{display:grid;grid-template-columns:1.1fr 1.3fr .8fr 1fr 1fr .6fr;align-items:center;min-height:68px;padding:0 20px;border-bottom:1px solid #edf0f4;font-size:12px}.orders-table .table-head{min-height:45px;background:#f8fafc;color:#8a94a6;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px}.orders-table button{border:0;background:none;color:#2859af;font-weight:700;cursor:pointer}.status{width:max-content;padding:7px 9px;border-radius:20px;font-size:9px;font-style:normal;font-weight:800}.status.preparing{background:#fff3d8;color:#ad7415}.status.shipping{background:#e4f4ff;color:#1672a7}.status.done{background:#e7f8ef;color:#26804b}.secure-badge{padding:10px 14px;border-radius:9px;background:#e8f7ef;color:#277a49;font-size:11px;font-weight:700}.payment-layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(300px,.75fr);gap:24px;align-items:start}.payment-card,.payment-summary,.profile-company,.profile-details{padding:28px;background:#fff;border:1px solid #e0e5ed;border-radius:16px;box-shadow:0 12px 35px #172e6a0c}.payment-card{display:grid;grid-template-columns:1fr 1fr;gap:18px}.payment-card>h3,.payment-card>label:nth-of-type(1),.payment-card>label:nth-of-type(2),.payment-card>.notice,.payment-card>.pay-button{grid-column:1/-1}.credit-card{grid-column:1/-1;width:350px;height:205px;margin:0 auto 8px;padding:24px;border-radius:18px;background:linear-gradient(135deg,#10295f,#2459ae 65%,#28a4dd);color:#fff;box-shadow:0 18px 38px #193d7b42}.card-top,.credit-card>div:last-child{display:flex;justify-content:space-between}.card-top span{font-size:20px;font-weight:900;letter-spacing:3px}.credit-card>i{display:block;width:43px;height:30px;margin:24px 0 17px;border-radius:6px;background:linear-gradient(135deg,#e7cc75,#fff0ad);box-shadow:inset 0 0 0 1px #aa9148}.credit-card>strong{display:block;font-size:20px;letter-spacing:2px}.credit-card>div:last-child{margin-top:16px}.credit-card>div:last-child span{display:flex;flex-direction:column;font-size:10px;text-transform:uppercase}.credit-card small{margin-bottom:3px;color:#b9cff6;font-size:7px;letter-spacing:1px}.payment-card h3{margin:4px 0 0}.card-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.pay-button{height:54px;border:0;border-radius:11px;background:linear-gradient(110deg,#1e8a55,#27aa6d);color:#fff;font-weight:800;cursor:pointer;box-shadow:0 10px 25px #20885832}.payment-summary h3{margin:0 0 20px}.summary-products{display:grid;gap:10px;padding-bottom:18px;border-bottom:1px solid #e7ebf1}.summary-products>div{display:flex;align-items:center;gap:10px}.summary-products>div>span{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:#eaf1ff;color:#2859af;font-size:10px;font-weight:800}.summary-products p{display:flex;flex-direction:column;margin:0;min-width:0}.summary-products strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.summary-products small{margin-top:4px;color:#7e899b}.payment-summary dl{margin:20px 0}.payment-summary dl div{display:flex;justify-content:space-between;padding:9px 0;font-size:12px}.payment-summary dd{margin:0;font-weight:700}.summary-total{margin-top:10px;padding-top:17px!important;border-top:1px solid #e2e7ef;font-size:17px!important}.summary-total dd{color:#2455a7}.empty-cart{display:flex;flex-direction:column;align-items:center;gap:10px;padding:30px;color:#8892a5}.empty-cart>strong{font-size:12px}.empty-cart button{border:0;background:none;color:#2859af;font-weight:700;cursor:pointer}.payment-note{padding:12px;border-radius:9px;background:#f4f7fb;color:#788398;font-size:10px}.profile-layout{display:grid;grid-template-columns:300px 1fr;gap:24px}.profile-company{text-align:center}.profile-company>span{display:grid;place-items:center;width:80px;height:80px;margin:5px auto 18px;border-radius:20px;background:linear-gradient(145deg,#e8effd,#cadbfd);color:#2859af;font-size:32px;font-weight:900}.profile-company h3{margin-bottom:5px}.profile-company p{color:#808a9c}.profile-company em{display:inline-block;padding:7px 10px;border-radius:20px;background:#e6f8ed;color:#28814d;font-size:9px;font-style:normal;font-weight:800}.profile-details h3{margin-top:0}.profile-details dl{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:0}.profile-details dl div{padding:17px 0;border-bottom:1px solid #edf0f4}.profile-details dt{font-size:9px;color:#8b95a6;text-transform:uppercase}.profile-details dd{margin:6px 0 0;font-size:13px;font-weight:700}
@media(max-width:750px){.portal-page{padding:30px 14px 50px}.page-title{align-items:flex-start;gap:15px}.page-title h2{font-size:24px}.page-title p{display:none}.page-title>button{font-size:10px}.orders-table{overflow-x:auto}.orders-table>div{min-width:760px}.payment-layout,.profile-layout{grid-template-columns:1fr}.payment-card{padding:18px;display:block}.payment-card>*{margin-bottom:16px}.credit-card{width:100%;max-width:350px;height:190px}.payment-summary{order:-1}.profile-details dl{grid-template-columns:1fr}.secure-badge{display:none}}
/* Eksenpet yapısından uyarlanan ticari katalog detayları */
.announcement{height:34px;padding:0 max(28px,calc((100vw - 1370px)/2));display:flex;align-items:center;justify-content:space-between;background:#0b214d;color:#dce8ff;font-size:10px}.announcement div{display:flex;gap:18px}.announcement button{border:0;background:none;color:#dce8ff;font-size:9px;font-weight:700;cursor:pointer}.announcement button:hover{color:#59c5f2}.portal-stats>button{display:flex;align-items:center;gap:13px;padding:17px 18px;border:1px solid #e3e8f0;border-radius:14px;background:#fff;box-shadow:0 8px 24px #172e6a0d;text-align:left;color:#172e6a;cursor:pointer;transition:.2s}.portal-stats>button:hover{transform:translateY(-3px);border-color:#b9c9e5;box-shadow:0 13px 28px #172e6a17}.portal-stats>button>p{flex:1}.portal-stats>button>b{color:#7c8da8}.product-meta{display:grid;gap:4px;margin:-4px 0 13px;padding:10px;border-radius:8px;background:#f7f9fc;color:#818b9c;font-size:8px}.product-meta em{color:#28804d;font-style:normal;font-weight:700}.price-label{color:#8a94a5;font-size:8px;text-transform:uppercase}.quantity{display:flex;align-items:center;height:34px;margin-bottom:9px}.quantity button{width:32px;height:32px;border:1px solid #dce2eb;background:#f7f9fc;color:#2859af;font-size:15px;cursor:pointer}.quantity strong{display:grid;place-items:center;width:34px;height:32px;border-top:1px solid #dce2eb;border-bottom:1px solid #dce2eb;font-size:11px}.quantity span{margin-left:8px;color:#8b95a6;font-size:8px;font-weight:800}.product-info .add-cart{width:100%;height:41px;border:1px solid #2859af;border-radius:8px;background:#fff;color:#2859af;font-size:11px;font-weight:800;cursor:pointer}.product-info .add-cart:hover{background:#2859af;color:#fff}.product-info h3{height:auto;min-height:38px}.product-card{display:flex;flex-direction:column}.product-info{display:flex;flex:1;flex-direction:column}.product-info .price{margin-bottom:8px}
@media(max-width:750px){.announcement{height:auto;min-height:34px;padding:7px 14px}.announcement div{display:none}.portal-stats>button{padding:12px}.portal-stats>button>b{display:none}}
/* Gönderilen referansa göre ana mağaza ekranı */
.dealer-portal .portal-header{min-height:66px}.dealer-portal .shop-toolbar{min-height:184px;padding-top:42px;padding-bottom:58px}.dealer-portal .shop-toolbar h2{font-size:31px}.dealer-portal .portal-stats{max-width:1346px;gap:14px;margin-top:-32px}.dealer-portal .portal-stats>div{min-height:74px;padding:16px 18px}.dealer-portal .search-bar{max-width:1294px;margin-top:22px}.dealer-portal .shop-layout{grid-template-columns:245px 1fr;gap:28px;padding-top:30px}.dealer-portal .categories{padding:20px 15px}.dealer-portal .categories>button{min-height:45px}.dealer-portal .product-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.dealer-portal .product-card{border-radius:14px}.dealer-portal .product-image{height:185px}.dealer-portal .product-info{padding:17px}.dealer-portal .product-info h3{min-height:38px;margin:8px 0 20px}.dealer-portal .product-info .price{margin-top:auto;margin-bottom:14px;font-size:19px}.dealer-portal .product-info .add-cart{height:41px}.dealer-portal .product-image span{background:#fff;color:#287744;box-shadow:0 2px 8px #172e6a17}.dealer-portal .result-line{min-height:44px}
@media(max-width:1050px){.dealer-portal .product-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:750px){.dealer-portal .shop-toolbar{min-height:170px}.dealer-portal .shop-layout{display:block}.dealer-portal .product-grid{grid-template-columns:1fr}.dealer-portal .product-image{height:220px}}
/* Kampanya bandı ve vitrin banner'ı */
.shipping-strip{height:40px;display:flex;align-items:center;justify-content:center;gap:5px;background:#ba3939;color:#fff;font-size:13px;font-style:italic}.shipping-strip strong{font-size:14px}.campaign-slider{position:relative;max-width:1324px;height:360px;margin:26px auto 0;background-size:cover;background-position:center;border-radius:3px;overflow:hidden;color:#fff;box-shadow:0 12px 35px #081c4321}.campaign-copy{position:absolute;left:54px;top:50%;transform:translateY(-50%);z-index:2}.campaign-copy>span{display:inline-block;margin-bottom:13px;color:#67d2ff;font-size:11px;font-weight:900;letter-spacing:2.2px}.campaign-copy h2{margin:0;color:#fff;font-size:36px;line-height:1.1;letter-spacing:-1px}.campaign-copy h2 b{color:#26b8ed}.campaign-copy p{margin:17px 0 22px;color:#d9e8ff;font-size:13px;line-height:1.6}.campaign-copy>div{display:flex;align-items:center;gap:18px}.campaign-copy button{height:43px;padding:0 20px;border:1px solid #39c5f2;border-radius:22px;background:#22a9dd;color:#fff;font-size:10px;font-weight:900;cursor:pointer}.campaign-copy small{color:#b8cbe8;font-size:10px}.campaign-badge{position:absolute;right:42px;top:28px;display:flex;align-items:center;gap:9px;padding:12px 15px;border:1px solid #ffffff42;border-radius:10px;background:#071c3fc4;backdrop-filter:blur(7px)}.campaign-badge strong{font-size:24px;color:#48c9f4}.campaign-badge span{font-size:8px;font-weight:800;line-height:1.4}.slider-arrow{position:absolute;z-index:4;top:50%;transform:translateY(-50%);display:grid;place-items:center;width:34px;height:42px;border:1px solid #ffffff72;background:#ffffffdf;color:#17366e;font-size:24px;cursor:pointer}.slider-arrow.left{left:0}.slider-arrow.right{right:0}.slider-dots{position:absolute;bottom:14px;left:50%;display:flex;gap:7px;transform:translateX(-50%)}.slider-dots i{width:7px;height:7px;border-radius:50%;background:#ffffff8a}.slider-dots i.active{width:22px;border-radius:8px;background:#2cc2ef}.campaign-slider+.shop-toolbar{margin-top:26px}.campaign-slider+.shop-toolbar{min-height:150px;padding-top:30px;padding-bottom:55px}
@media(max-width:750px){.shipping-strip{padding:0 12px;text-align:center;font-size:10px}.shipping-strip strong{font-size:11px}.campaign-slider{height:285px;margin:14px 10px 0;background-position:62% center;border-radius:12px}.campaign-copy{left:30px;right:25px}.campaign-copy h2{font-size:25px}.campaign-copy p{max-width:250px;font-size:11px}.campaign-copy small,.campaign-badge{display:none}.campaign-copy button{height:39px}.campaign-slider+.shop-toolbar{margin-top:14px}}
.shipping-strip{background:#101f3f}.empty-orders{min-height:290px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;border:1px solid #e0e5ed;border-radius:16px;background:#fff;box-shadow:0 10px 30px #172e6a0c;text-align:center}.empty-orders>span{display:grid;place-items:center;width:64px;height:64px;border-radius:18px;background:#edf3ff;color:#2859af;font-size:28px}.empty-orders h3{margin:18px 0 7px;font-size:18px}.empty-orders p{margin:0 0 20px;color:#7d8798;font-size:12px}.empty-orders button{padding:12px 18px;border:0;border-radius:9px;background:#2859af;color:#fff;font-weight:700;cursor:pointer}
/* Modern sipariş boş durumu */
.portal-page:has(.empty-orders){position:relative}.portal-page:has(.empty-orders)::before{content:"";position:absolute;right:4%;top:90px;width:240px;height:240px;border-radius:50%;background:#2a5db510;filter:blur(2px)}.empty-orders{position:relative;overflow:hidden;min-height:420px;padding:48px;background:linear-gradient(145deg,#fff 20%,#f7faff);border-color:#dce5f2}.empty-orders::before{content:"";position:absolute;width:320px;height:320px;right:-170px;bottom:-190px;border-radius:50%;border:50px solid #2b5db50a}.empty-orb{position:relative;display:grid;place-items:center;width:84px;height:84px;margin-bottom:18px;border-radius:26px;background:linear-gradient(145deg,#e9f1ff,#d8e6ff);box-shadow:0 14px 30px #2859af22}.empty-orb>span{position:relative;z-index:2;color:#2859af;font-size:34px}.empty-orb i{position:absolute;border:1px solid #2e62ba1c;border-radius:50%}.empty-orb i:nth-child(2){width:108px;height:108px}.empty-orb i:nth-child(3){width:132px;height:132px}.empty-kicker{margin-top:8px;color:#2d5eb3!important;background:none!important;width:auto!important;height:auto!important;font-size:9px!important;font-weight:900;letter-spacing:2px}.empty-orders h3{margin-top:9px;font-size:24px}.empty-orders>p{max-width:490px;line-height:1.65;font-size:13px}.empty-orders>button{display:flex;align-items:center;gap:12px;min-width:190px;justify-content:center;padding:14px 18px;background:linear-gradient(110deg,#193d83,#2e64bb);box-shadow:0 11px 24px #2859af2c;transition:.2s}.empty-orders>button:hover{transform:translateY(-2px);box-shadow:0 15px 30px #2859af3b}.empty-orders>button b{font-size:16px}.order-steps{position:relative;z-index:2;width:min(680px,100%);margin-top:42px;padding-top:27px;border-top:1px solid #e2e8f2;display:flex;align-items:center;justify-content:center}.order-steps>div{display:flex;align-items:center;gap:10px;text-align:left}.order-steps>div>span{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#edf3ff;color:#2859af;font-size:11px;font-weight:900}.order-steps p{display:flex;flex-direction:column;margin:0}.order-steps strong{font-size:10px}.order-steps small{margin-top:3px;color:#919aaa;font-size:8px}.order-steps>i{width:55px;height:1px;margin:0 18px;background:linear-gradient(90deg,#cad5e7,#e4e9f1)}.order-filters{padding:5px;border:1px solid #e0e6ef;border-radius:12px;background:#fff;width:max-content;box-shadow:0 6px 18px #172e6a08}.order-filters button{border:0}.order-filters button.active{background:#e9f1ff}.orders-table{box-shadow:0 16px 42px #172e6a0e}
@media(max-width:650px){.empty-orders{min-height:440px;padding:35px 18px}.order-steps{align-items:flex-start}.order-steps>i{width:15px;margin:15px 5px}.order-steps>div{flex-direction:column;text-align:center}.order-steps p{max-width:90px}.order-filters{width:100%;overflow-x:auto;display:flex}.order-filters button{white-space:nowrap}}
/* Modern ödeme ve sepet sayacı */
.payment-card{background:linear-gradient(155deg,#fff,#fbfdff);border-color:#dce4f0}.credit-card{position:relative;overflow:hidden;background:linear-gradient(125deg,#0e2b65 0%,#265bb1 58%,#28a8dd 100%);box-shadow:0 24px 48px #173d8038}.credit-card::before{content:"";position:absolute;width:230px;height:230px;right:-110px;top:-130px;border:1px solid #ffffff20;border-radius:50%;box-shadow:0 0 0 35px #ffffff08}.credit-card>*{position:relative;z-index:1}.payment-card input,.payment-card select{background:#f8faff;border-color:#d7dfec}.payment-card input:focus,.payment-card select:focus{background:#fff}.pay-button{background:linear-gradient(110deg,#14814d,#24aa6b);box-shadow:0 12px 28px #1b915a38;transition:.2s}.pay-button:hover{transform:translateY(-2px);box-shadow:0 16px 34px #1b915a4a}.summary-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.summary-heading h3{margin:0}.summary-heading>span{padding:6px 9px;border-radius:20px;background:#edf3ff;color:#2859af;font-size:9px;font-weight:800}.cart-expiry{display:grid;grid-template-columns:40px 1fr;gap:0 11px;margin-bottom:20px;padding:14px;border:1px solid #f0dba9;border-radius:12px;background:linear-gradient(110deg,#fffaf0,#fffdf8)}.cart-expiry>span{grid-row:1/3;display:grid;place-items:center;width:40px;height:40px;border-radius:10px;background:#fff0c9;color:#ad7415;font-size:20px}.cart-expiry>div{display:flex;align-items:center;justify-content:space-between}.cart-expiry small{color:#9b7b32;font-size:7px;font-weight:800;letter-spacing:.5px}.cart-expiry strong{color:#a66b0d;font-size:18px;font-variant-numeric:tabular-nums}.cart-expiry p{margin:3px 0 0;color:#9c895d;font-size:8px}.payment-summary{position:sticky;top:20px}.payment-note{border:1px solid #e5eaf2}.card-row input::placeholder{letter-spacing:1px}
@media(max-width:750px){.payment-summary{position:static}.cart-expiry>div{gap:8px}.cart-expiry p{line-height:1.4}}
.dealer-portal .product-image{display:block;background-size:contain;background-repeat:no-repeat;background-position:center;background-color:#fff}.catalog-pagination{display:flex;align-items:center;justify-content:center;gap:12px;margin:30px 0 5px}.catalog-pagination button{display:grid;place-items:center;width:42px;height:42px;border:1px solid #d7e0ed;border-radius:10px;background:#fff;color:#2859af;font-size:17px;cursor:pointer}.catalog-pagination button:hover:not(:disabled){background:#2859af;color:#fff}.catalog-pagination button:disabled{opacity:.4;cursor:not-allowed}.catalog-pagination span{min-width:72px;text-align:center;color:#68758b;font-size:11px;font-weight:800}
.catalog-tools{display:flex;align-items:center;gap:10px}.currency-toggle{display:flex;padding:3px;border:1px solid #d7e0ed;border-radius:10px;background:#fff}.currency-toggle button{height:30px;padding:0 11px;border:0;border-radius:7px;background:transparent;color:#7a869a;font-size:9px;font-weight:800;cursor:pointer}.currency-toggle button.active{background:#2859af;color:#fff;box-shadow:0 4px 10px #2859af28}.alternate-price{margin-top:-9px;margin-bottom:13px;color:#8a95a8;font-size:9px;font-weight:700}.dealer-portal .product-info .price{margin-bottom:14px}.dealer-portal .product-info:has(.alternate-price) .price{margin-bottom:11px}
@media(max-width:650px){.result-line{align-items:flex-start;gap:10px}.catalog-tools{align-items:flex-end;flex-direction:column}.catalog-tools select{max-width:150px}.currency-toggle button{padding:0 8px}}
/* Kompakt kategori listesi */
.category-list{max-height:390px;padding-right:5px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#b9c8df #f2f5f9}.category-list::-webkit-scrollbar{width:5px}.category-list::-webkit-scrollbar-track{background:#f2f5f9;border-radius:10px}.category-list::-webkit-scrollbar-thumb{background:#b9c8df;border-radius:10px}.category-list button{width:100%;min-height:45px;padding:9px 12px;display:flex;align-items:center;justify-content:space-between;border:0;border-bottom:1px solid #edf0f5;border-radius:7px;background:#fff;color:#56627a;text-align:left;font-size:10px;font-weight:700;cursor:pointer}.category-list button:hover,.category-list button.active{background:#edf4ff;color:#204d9f}.category-list button span{line-height:1.25}.category-list button b{flex:0 0 auto;margin-left:7px;font-size:17px}.category-hint{display:flex;align-items:center;justify-content:center;gap:6px;margin:9px 0 0;color:#8994a7;font-size:8px}.category-hint span{color:#2859af;font-size:12px}.catalog-tools select{cursor:pointer}.catalog-tools select:focus{border-color:#2859af;box-shadow:0 0 0 3px #2859af15}
@media(max-width:750px){.category-list{max-height:180px}.category-hint{margin-bottom:4px}}
/* Sepet taslağı ve tıklanabilir sepet */
.cart-box{color:#fff;text-align:left;font:inherit;cursor:pointer;transition:.2s}.cart-box:hover{transform:translateY(-2px);background:#ffffff1e;border-color:#ffffff55}.cart-go{margin-left:auto;color:#bcd9ff;font-size:17px}.cart-draft{margin-bottom:22px;overflow:hidden;border:1px solid #dbe4f1;border-radius:16px;background:#fff;box-shadow:0 14px 36px #172e6a0e}.draft-heading{min-height:74px;padding:15px 20px;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(110deg,#102e68,#285fb7);color:#fff}.draft-heading>div:first-child{display:flex;align-items:center;gap:12px}.draft-heading>div:first-child>span{display:grid;place-items:center;width:40px;height:40px;border-radius:11px;background:#ffffff17;font-size:20px}.draft-heading p,.draft-footer p{display:flex;flex-direction:column;margin:0}.draft-heading small,.draft-timer small,.draft-footer small{margin-bottom:4px;color:#bcd2fb;font-size:8px;font-weight:800;letter-spacing:1px}.draft-heading p strong{font-size:14px}.draft-timer{min-width:90px;padding:9px 13px;border:1px solid #ffffff2e;border-radius:10px;background:#ffffff10;text-align:center}.draft-timer{display:flex;flex-direction:column}.draft-timer strong{font-size:17px;font-variant-numeric:tabular-nums}.draft-products{padding:5px 20px}.draft-products>div{min-height:76px;display:grid;grid-template-columns:52px 1fr auto;align-items:center;gap:13px;border-bottom:1px solid #edf0f5}.draft-products img{width:52px;height:52px;border-radius:9px;object-fit:contain;border:1px solid #e4e8ef}.draft-products p{display:flex;flex-direction:column;margin:0;min-width:0}.draft-products p strong{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.draft-products p small{margin-top:5px;color:#8490a3;font-size:9px}.draft-products>div>b{color:#173c7e;font-size:12px}.draft-footer{min-height:78px;padding:14px 20px;display:flex;align-items:center;justify-content:flex-end;gap:25px;background:#f8fafd}.draft-footer p{text-align:right}.draft-footer p small{color:#8b96a8}.draft-footer p strong{color:#173c7e;font-size:18px}.draft-footer button{height:43px;padding:0 18px;border:0;border-radius:9px;background:#2859af;color:#fff;font-size:10px;font-weight:800;cursor:pointer}.draft-footer button span{margin-left:13px}.orders-table{margin-top:18px}
@media(max-width:650px){.cart-go{display:none}.draft-heading{padding:12px}.draft-products{padding:5px 12px}.draft-products>div{grid-template-columns:44px 1fr}.draft-products img{width:44px;height:44px}.draft-products>div>b{grid-column:2}.draft-footer{justify-content:space-between;padding:12px}.draft-footer{gap:10px}.draft-footer button{padding:0 12px}}
.payment-details{grid-column:1/-1;padding:20px;border:1px solid #dfe6f0;border-radius:13px;background:#fff}.payment-details h3{margin:0 0 17px}.payment-details>div{display:grid;grid-template-columns:1fr 1fr;gap:16px}.payment-details input[readonly]{color:#34435f;background:#f0f4f9;font-weight:700;cursor:default}.draft-status{padding:8px 12px;border:1px solid #ffffff33;border-radius:20px;background:#ffffff13;color:#dbe8ff;font-size:9px;font-weight:800}.payment-card>.payment-details{grid-column:1/-1}
@media(max-width:650px){.payment-details>div{grid-template-columns:1fr}.draft-status{font-size:8px}}
.online-payment-card{max-width:920px;margin:0 auto}.amount-input{display:flex}.amount-input input{border-radius:8px 0 0 8px}.amount-input select{width:120px;border-left:0;border-radius:0 8px 8px 0;background:#f4f7fb;font-weight:700}
.product-image{width:100%;padding:0;border:0;background-color:#fff;background-position:center;cursor:pointer}.product-name{cursor:pointer}.product-name:hover{color:#2859af}
.product-modal{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;padding:24px;background:#081329b8;backdrop-filter:blur(4px)}
.product-detail{position:relative;width:min(900px,100%);display:grid;grid-template-columns:minmax(280px,.9fr) minmax(320px,1.1fr);overflow:hidden;border-radius:18px;background:#fff;box-shadow:0 30px 90px #0005}
.detail-close{position:absolute;z-index:2;top:14px;right:16px;width:38px;height:38px;border:0;border-radius:50%;background:#edf1f7;color:#223653;font-size:25px;line-height:1;cursor:pointer}
.detail-image{min-height:450px;display:grid;place-items:center;padding:42px;background:#f7f8fa}.detail-image img{width:100%;max-height:390px;object-fit:contain}
.detail-content{display:flex;flex-direction:column;justify-content:center;padding:52px}.detail-content>small{color:#20a5df;font-size:10px;font-weight:800;letter-spacing:1.5px}.detail-content h2{margin:10px 40px 18px 0;color:#162c52;font-size:30px;line-height:1.2}.detail-price{color:#102d67;font-size:28px;font-weight:800}.detail-content .alternate-price{margin:5px 0 18px}.detail-stock{width:max-content;padding:7px 10px;border-radius:7px;background:#e8f7ee;color:#237a46;font-size:11px;font-weight:800}.detail-actions{display:flex;gap:14px;margin:25px 0}.quantity{display:flex;border:1px solid #d7dde7;border-radius:8px;overflow:hidden}.quantity button,.quantity span{width:42px;height:44px;display:grid;place-items:center;border:0;background:#f3f5f8}.quantity span{background:#fff;font-weight:700}.quantity button{cursor:pointer;font-size:17px}.detail-cart{flex:1;border:0;border-radius:8px;background:#2859af;color:#fff;font-weight:800;cursor:pointer}.detail-content p{padding-top:18px;border-top:1px solid #e3e7ed;color:#667187;font-size:12px;line-height:1.5}
@media(max-width:700px){.product-modal{padding:12px}.product-detail{grid-template-columns:1fr;max-height:94vh;overflow-y:auto}.detail-image{min-height:260px;padding:30px}.detail-image img{max-height:230px}.detail-content{padding:28px}.detail-content h2{font-size:22px}.detail-actions{flex-direction:column}.detail-cart{min-height:46px}}
.dealer-discount-banner{position:relative;z-index:5;padding:11px 24px;background:#e8f8ef;color:#187545;text-align:center;font-size:13px;border-bottom:1px solid #c7ead6}.dealer-discount-banner strong{font-size:15px}.special-price-label{width:max-content;margin:0 0 7px;padding:5px 8px;border-radius:6px;background:#e7f8ee;color:#187747;font-size:9px;font-weight:900}.old-price{margin-bottom:3px;color:#929baa;font-size:12px;text-decoration:line-through}.summary-old-price{text-decoration:line-through;color:#8b95a6}.payment-summary dl .summary-discount{color:#16804c}.summary-discount dd{font-weight:900}
</style>
