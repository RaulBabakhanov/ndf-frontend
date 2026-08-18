<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

interface TurnstileApi {
  render: (element: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const props = defineProps<{ siteKey: string }>()
const emit = defineEmits<{ verified: [token: string] }>()
const container = ref<HTMLElement | null>(null)
const loadError = ref(false)
let widgetId = ''

function waitForApi(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    let checks = 0
    const timer = window.setInterval(() => {
      if (window.turnstile) {
        window.clearInterval(timer)
        resolve(window.turnstile)
      } else if (++checks > 100) {
        window.clearInterval(timer)
        reject(new Error('Turnstile yüklenemedi'))
      }
    }, 50)
  })
}

async function mountWidget() {
  if (!props.siteKey || !container.value) return void (loadError.value = true)
  if (!document.querySelector('script[data-ndf-turnstile]')) {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.dataset.ndfTurnstile = 'true'
    document.head.appendChild(script)
  }
  try {
    const api = await waitForApi()
    if (!container.value) return
    widgetId = api.render(container.value, {
      sitekey: props.siteKey,
      theme: 'light',
      size: 'flexible',
      callback: (token: string) => emit('verified', token),
      'expired-callback': () => emit('verified', ''),
      'error-callback': () => { emit('verified', ''); loadError.value = true },
    })
  } catch { loadError.value = true }
}

function reset() {
  emit('verified', '')
  if (widgetId && window.turnstile) window.turnstile.reset(widgetId)
}

defineExpose({ reset })
onMounted(mountWidget)
onBeforeUnmount(() => { if (widgetId && window.turnstile) window.turnstile.remove(widgetId) })
</script>

<template>
  <div class="captcha-shell">
    <div ref="container"></div>
    <p v-if="loadError">Güvenlik doğrulaması yüklenemedi. İnternet bağlantınızı kontrol edin.</p>
    <small v-else>🔒 Güvenli bot doğrulaması</small>
  </div>
</template>

<style scoped>
.captcha-shell { width: 100%; padding: 12px; border: 1px solid #d8e2f1; border-radius: 12px; background: #f7faff; }
.captcha-shell small { display: block; margin-top: 7px; color: #687895; font-size: 11px; }
.captcha-shell p { margin: 0; color: #c32d36; font-size: 13px; }
</style>
