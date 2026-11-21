<template>
  <div ref="container" class="echart-canvas"></div>
</template>

<script setup>
import * as echarts from 'echarts'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

const props = defineProps({
  option: { type: Object, default: null },
  renderer: { type: String, default: 'canvas' }
})

const emit = defineEmits(['chart-click', 'ready'])

const container = ref(null)
const instance = shallowRef(null)
let observer = null

onMounted(() => {
  if (!container.value) return
  instance.value = echarts.init(container.value, null, { renderer: props.renderer })
  instance.value.on('click', (params) => emit('chart-click', params))
  if (props.option) instance.value.setOption(props.option, { notMerge: true })
  observer = new ResizeObserver(() => {
    instance.value?.resize()
  })
  observer.observe(container.value)
  emit('ready', instance.value)
})

watch(
  () => props.option,
  (option) => {
    if (instance.value && option) instance.value.setOption(option, { notMerge: true })
  }
)

onBeforeUnmount(() => {
  observer?.disconnect()
  instance.value?.dispose()
  instance.value = null
})

defineExpose({
  getInstance: () => instance.value
})
</script>

<style scoped>
.echart-canvas {
  width: 100%;
  height: 100%;
  min-height: 280px;
}
</style>
