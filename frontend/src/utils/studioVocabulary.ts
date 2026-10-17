/**
 * 创作台词汇表（契约常量 ↔ 中文标签）
 * ---------------------------------------------------------------
 * 后端契约里 PropertyType / PropertyStatus 都是大写常量，界面需要中文标签。
 * 映射集中在这里，避免同一份标签散落到多个组件后各自漂移。
 *
 * 回退策略：后端若返回未收录的取值，标签函数会原样返回该值，
 * 界面上不会出现「有内容却显示空白」。
 */
import type { PropertyStatus, PropertyType } from '@/types/studio'

/** 资源类型的展示顺序：角色 → 规则 → 实体 */
export const PROPERTY_TYPES: readonly PropertyType[] = ['CHARACTER', 'RULE', 'ENTITY']

/** 资源类型标签 */
export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  CHARACTER: '角色',
  RULE: '规则',
  ENTITY: '实体',
}

/**
 * 资源状态标签。
 * `CREATED` 是契约（接口文档 v1.0）里唯一出现的取值：POST /properties 的创建回执；
 * 其余三个是前端为本地草稿预留的取值，后端补上之前只是占位。
 */
export const PROPERTY_STATUS_LABEL: Record<PropertyStatus, string> = {
  CREATED: '已创建',
  ACTIVE: '已生效',
  INACTIVE: '已停用',
  DRAFT: '草稿',
}

/** 取资源类型的中文标签；未知取值原样返回 */
export function propertyTypeLabel(value: PropertyType): string {
  return PROPERTY_TYPE_LABEL[value] ?? value
}

/** 取资源状态的中文标签；未知取值原样返回 */
export function propertyStatusLabel(value: PropertyStatus): string {
  return PROPERTY_STATUS_LABEL[value] ?? value
}

/**
 * 旁白说话人。
 * 契约示例（3.1 添加必要场景）里旁白场景的 speaker 就是「旁白」，
 * 它不依赖任何角色资源，因此锚点的说话人下拉永远提供这一项。
 */
export const NARRATOR_SPEAKER = '旁白'

/**
 * 把自由属性的值格式化成可读文本。
 * attributes 允许布尔 / 数字 / 字符串，也可能被后端塞进嵌套结构，
 * 因此这里对对象做 JSON 序列化兜底，任何取值都不会渲染成空白。
 */
export function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—'
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return '[无法显示]'
    }
  }
  return String(value)
}
