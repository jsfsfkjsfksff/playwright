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

/** 资源类型标签（契约三类） */
export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  CHARACTER: '角色',
  RULE: '规则',
  ENTITY: '实体',
}

/**
 * 契约三类之外、但后端实际也会落库的取值及其标签。
 *
 * 依据（全部来自后端源码，不是猜的）：
 *   · `PropertyRequestDto.type` 注释：CHARACTER, ITEM, LOCATION, RULE；
 *   · `RelationTargetDto.targetType` 注释：如 "ITEM", "LOCATION", "CHARACTER"，
 *     且 `PropertyController` 自动创建关联实体时默认就给 `ITEM`；
 *   · `PEngineController` 里专门按 `"RELATION".equalsIgnoreCase(...)` 分支处理
 *     显式关系节点（attributes 里带 subject / object）。
 *
 * 为什么不并进 PROPERTY_TYPE_LABEL：那会让 PropertyType 联合类型放开这三个取值，
 * 而「新增资源」表单的类型选项正是由该联合驱动的 —— 一并放开等于顺手把
 * ITEM / LOCATION / RELATION 变成了可选项，超出本次需求。
 * 这里只补**展示标签**，取值本身仍原样传递。
 */
export const EXTRA_PROPERTY_TYPE_LABEL: Record<string, string> = {
  ITEM: '物品',
  LOCATION: '地点',
  RELATION: '关系',
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

/**
 * 取资源类型的中文标签；未知取值原样返回。
 *
 * 入参放宽为 `string`（与下面的 propertyStatusLabel 一致）：后端不校验 type，
 * 库里可能存在契约三类之外的取值（自动创建的关联实体默认 `ITEM`、
 * 调用方直接传的 `LOCATION` 等），这些分组标题要原样显示该取值，
 * 而不是因为拿不到标签而留空。
 */
export function propertyTypeLabel(value: string): string {
  return PROPERTY_TYPE_LABEL[value as PropertyType] ?? EXTRA_PROPERTY_TYPE_LABEL[value] ?? value
}

/**
 * 取资源状态的中文标签；未知取值原样返回。
 * 入参放宽为 `string`：后端 POST /properties 实际回 `SAVED_WITH_NATIVE_RELATIONS`，
 * 不在 PROPERTY_STATUS_LABEL 的预置取值里，界面应原样显示而不是留空。
 */
export function propertyStatusLabel(value: string): string {
  return PROPERTY_STATUS_LABEL[value as PropertyStatus] ?? value
}

/**
 * 旁白说话人。
 * 契约示例（3.1 添加必要场景）里旁白场景的 speaker 就是「旁白」，
 * 它不依赖任何角色资源。
 *
 * ⚠️ 本轮需求已「彻底移除说话人」：界面不再提供任何说话人选择控件，
 *    锚点的 speaker 恒为该常量。数据层保留它纯粹是为了契约兼容
 *    （后端 Scene 实体有 speaker 字段），详见 types/studio.ts 的 SceneAnchor.speaker。
 */
export const NARRATOR_SPEAKER = '旁白'

/**
 * 取剧情卡片的显示标题。
 *
 * 规则：创作者自定义的 `cardName` 优先；没命名（空串或只有空白）时回退显示 `sceneId`。
 * 这样界面上永远不会出现「一张没有标题的卡片」，而 sceneId 本身就是创作者认得的东西。
 */
export function anchorTitle(anchor: { cardName?: string; sceneId: string }): string {
  const name = (anchor.cardName ?? '').trim()
  return name === '' ? anchor.sceneId : name
}

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
