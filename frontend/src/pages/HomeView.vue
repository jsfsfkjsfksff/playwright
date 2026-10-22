<script setup lang="ts">
/**
 * HomeView —— 主界面（菜单跳转页）
 * ---------------------------------------------------------------
 * 版式对齐参考稿 podcast-engine/index.html，自上而下三层，靠 position + z-index 隔离：
 *   1. 背景层   .nw-home__backdrop   —— 整张静态背景图铺满视口
 *                叠一层内联噪声，压掉大面积渐变可能出现的色带
 *   2. 动态层   HomeMotionLayer      —— 笔墨 / 光环 / 呼吸光 / 水波纹 / 光点
 *   3. 内容层   HomeBrand + HomeMenu（左）
 *                HomeNewsPanel（右，绝对定位）
 *
 * 主题说明：全站只有夜间模式（主题切换入口已按需求移除），
 * 因此本页没有、也不应该再有任何主题相关控件。
 *
 * 背景说明（本次变更）：
 *   页面背景改为一张静态图（src/assets/home-backdrop.jpg）：球体、月亮、流星、
 *   雪山与湖面都画在图里。因为图中央的球体与页面原先自绘的 AudioOrb 位置重合，
 *   按需求去掉页面自己的球体，避免两个球叠在一起；按钮、菜单、公告等其余部分未改动。
 *   两点代价/取舍：
 *     - 背景是固定插画，不再随日夜主题变化（图只有夜间版本）；
 *     - 中央动态层保留：参考稿里光环 / 呼吸光 / 涟漪本来就是叠在图上的球体之上，
 *       现在它们的中心与图上的球心一致，观感与参考稿一致。
 *
 * 与参考稿的其它差异：
 *   1. 参考稿写死的菜单 / 公告改为子组件内的 TypeScript 数组 + v-for。
 *   2. 页面文字与控件的配色全部引用语义化主题令牌，不写死色值。
 *
 * 交互：菜单与订阅入口的真实跳转由 HomeMenu / HomeNewsPanel 内的
 * <RouterLink> 承担；尚未开发的入口向上抛 feedback，由本页统一播报提示。
 *
 * 【设置入口 = 音色选择】
 *   音色选择按需求从播放页移到主界面的「设置」入口下：点菜单的「设置」不跳页，
 *   由 HomeMenu 抛 `settings` 事件，本页就地弹出 TimbreSelectModal。
 *   为什么不新开一个设置页：设置目前只有音色这一项，开页面反而多一层交互链路。
 *   选中的音色会提交后端（POST /api/v1/voices）—— 后端按它调用 TTS 合成，
 *   因此它不是纯本地偏好；提交失败只播报一句，不挡操作。
 */
import { computed, onBeforeUnmount, ref } from 'vue'

import homeBackdrop from '@/assets/home-backdrop.jpg'
import ToastPill from '@/components/base/ToastPill.vue'
import HomeBrand from '@/components/home/HomeBrand.vue'
import HomeMenu from '@/components/home/HomeMenu.vue'
import HomeMotionLayer from '@/components/home/HomeMotionLayer.vue'
import HomeNewsPanel from '@/components/home/HomeNewsPanel.vue'
import TimbreSelectModal from '@/components/feature/TimbreSelectModal.vue'
import { usePlayerStore } from '@/stores/player'
import { useStudioStore } from '@/stores/studio'
import { DEFAULT_TIMBRE_ID, TIMBRE_OPTIONS, buildTimbreVoiceConfig, resolveTimbreOption } from '@/types/studio'
import type { TimbreId, TimbreOption } from '@/types/studio'
import { NARRATOR_SPEAKER } from '@/utils/studioVocabulary'

/** 提示条停留时长（ms），与参考稿一致 */
const TOAST_DURATION = 1900

const toastMessage = ref('')
const toastVisible = ref(false)

/**
 * 定时器句柄。用普通变量而不是 ref：它不参与渲染，
 * 放进响应式系统只会带来无意义的依赖追踪。
 */
let toastTimer = 0

/** 播报一条提示；重复播报会重新计时，而不是叠加多条 */
function notify(message: string): void {
  toastMessage.value = message
  toastVisible.value = true

  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastVisible.value = false
  }, TOAST_DURATION)
}

/* =============================================================
 * 设置 → 音色选择
 * ============================================================= */

const player = usePlayerStore()
const studio = useStudioStore()

const timbreOpen = ref(false)
const timbreId = ref<TimbreId>(DEFAULT_TIMBRE_ID)

/** 音色提交中（面板已关，只用于防止连续切换时重复提交） */
const timbreSubmitting = ref(false)

/**
 * 面板里的候选音色。
 * store 里已有列表就用接口给的，否则用内置音色表 —— 保证面板永远是满的，
 * 不出现「还没加载完就一片空白」。
 */
const timbreOptions = computed<TimbreOption[]>(() =>
  player.voiceOptions.length > 0 ? player.voiceOptions : [...TIMBRE_OPTIONS],
)

/** 点「设置」：就地弹面板，并补拉一次音色列表（store 内部有缓存，重复打开不重复请求） */
function openTimbre(): void {
  timbreOpen.value = true
  void player.loadVoiceOptions()
}

/**
 * 确认选择：本地立即生效，同时提交给后端（POST /api/v1/voices）。
 *
 * 为什么先关面板再请求：面板是模态的，让它一直挂着等网络会显得卡住；
 * 而音色是否落库并不影响收听，因此不阻塞界面。
 * 失败时明确说「没提交成功」而不是「选择失败」—— 本地已经生效了。
 */
function handleConfirmTimbre(next: TimbreId): void {
  timbreId.value = next
  timbreOpen.value = false

  const label = resolveTimbreOption(next).label
  if (timbreSubmitting.value) {
    notify(`已选择音色：${label}`)
    return
  }

  timbreSubmitting.value = true
  // 主界面没有「当前场景」，发音人固定用旁白 —— 播客内容统一由旁白讲述
  const config = buildTimbreVoiceConfig(next, NARRATOR_SPEAKER, NARRATOR_SPEAKER)

  void studio
    .saveVoice(config)
    .then((ok) => {
      notify(ok ? `已选择音色：${label}` : `已选择音色：${label}（提交后端失败，本次收听不受影响）`)
    })
    .finally(() => {
      timbreSubmitting.value = false
    })
}

// 页面卸载时清理定时器，避免离开页面后仍在改动已失效的状态
onBeforeUnmount(() => {
  window.clearTimeout(toastTimer)
})
</script>

<template>
  <div class="nw-home">
    <!-- 1. 背景层：整张静态图铺满视口 -->
    <div
      class="nw-home__backdrop"
      :style="{ backgroundImage: `url(${homeBackdrop})` }"
      aria-hidden="true"
    />

    <!-- 颗粒感：参考稿 .bg__grain 的内联噪声，压掉渐变可能出现的色带 -->
    <div class="nw-home__grain" aria-hidden="true" />

    <!-- 2. 中央动态层 -->
    <HomeMotionLayer />

    <!-- 3. 内容层 -->
    <main class="nw-home__stage">
      <div class="nw-home__left">
        <HomeBrand />
        <HomeMenu @feedback="notify" @settings="openTimbre" />
      </div>

      <HomeNewsPanel class="nw-home__right" @feedback="notify" />
    </main>

    <!-- 设置 → 音色选择（点菜单「设置」就地弹出，不跳页） -->
    <TimbreSelectModal
      v-if="timbreOpen"
      :value="timbreId"
      :options="timbreOptions"
      :loading="player.voiceOptions.length === 0 && player.voiceOptionsError === null"
      @confirm="handleConfirmTimbre"
      @close="timbreOpen = false"
    />

    <ToastPill :message="toastMessage" :visible="toastVisible" />
  </div>
</template>

<style scoped>
.nw-home {
  position: relative;
  min-height: 100vh;
  min-height: 100svh;
  overflow-x: clip;
  color: var(--nw-color-text-primary);
  font-family: var(--nw-font-sans);
}

/* =============================================================
 * 1. 背景层：静态图 + 颗粒
 * ============================================================= */
.nw-home__backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--nw-z-background);
  /*
   * 铺满视口。图是 2145 × 1280（约 1.676），16:9 下上下各裁掉约 3%，
   * 球体、月亮、雪山与湖面都落在安全区内，不会被裁到。
   */
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  pointer-events: none;
}

.nw-home__grain {
  position: fixed;
  inset: -50%;
  z-index: var(--nw-z-far);
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/></filter><rect width='140' height='140' filter='url(%23n)' opacity='.6'/></svg>");
  opacity: 0.05;
  pointer-events: none;
}

/* =============================================================
 * 2 + 3. 舞台：左侧内容纵向排列，右侧面板绝对定位
 * ============================================================= */
.nw-home__stage {
  position: relative;
  z-index: var(--nw-z-content);
  display: flex;
  align-items: center;
  min-height: 100vh;
  min-height: 100svh;
  padding: 40px clamp(24px, 3.4vw, 58px);
}

.nw-home__left {
  display: flex;
  flex-direction: column;
  gap: 22px;
  width: min(560px, 47vw);
  /* 整体上提，让品牌区落在视觉中轴偏上的位置 */
  margin-top: -46px;
}

.nw-home__right {
  position: absolute;
  top: 50%;
  right: clamp(24px, 3.4vw, 58px);
  width: min(448px, 33vw);
  /* 整体往下压一点，与左侧品牌区错开 */
  transform: translateY(calc(-50% + 62px));
}

/* =============================================================
 * 响应式：先收窄两侧，再在窄屏堆叠
 * ============================================================= */
@media (max-width: 1240px) {
  .nw-home__left {
    width: min(520px, 50vw);
  }

  .nw-home__right {
    width: min(400px, 35vw);
  }
}

@media (max-width: 1020px) {
  .nw-home__left {
    width: min(520px, 54vw);
  }

  .nw-home__right {
    width: min(360px, 37vw);
  }
}

@media (max-width: 900px) {
  .nw-home__stage {
    flex-direction: column;
    align-items: stretch;
    padding: 30px 20px 56px;
  }

  .nw-home__left {
    width: 100%;
    margin-top: 0;
  }

  .nw-home__right {
    position: static;
    width: 100%;
    margin: 30px 0 0;
    transform: none;
  }
}
</style>
