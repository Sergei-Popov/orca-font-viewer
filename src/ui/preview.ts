// The Preview tab: an editable sample at any size, a waterfall of sizes, the alphabet lines the
// font covers, and (beside them) variable axes and OpenType feature switches.

import { alphabetLines, formatFixed, formatNumber } from '../describe'
import { compareFeatures, featureName, isOnByDefault, isUserFeature } from '../font/features'
import { snapAxisValue } from '../render'
import type { AxisInfo, FaceInfo } from '../font/info'
import type { Language, Strings } from '../i18n'
import { icon } from '../icons'
import { h, html, paintRange } from './dom'

export const WATERFALL_SIZES = [12, 14, 16, 18, 24, 32, 48, 64, 96]
export const SIZE_PRESETS = [16, 24, 36, 56, 72, 120]
export const DEFAULT_SIZE = 56
export const DEFAULT_LINE_HEIGHT = 1.25

export type PreviewState = {
  size: number
  lineHeight: number
  /** Text the person typed; null shows the default sample. */
  sample: string | null
  axes: Map<string, number>
  features: Map<string, boolean>
}

export type PreviewHost = {
  strings: Strings
  language: Language
  /** Called when axes or features change, to restyle every view of the font. */
  onStyleChange(): void
}

export class PreviewTab {
  readonly root = h('div', { class: 'fv-panel', role: 'tabpanel' })
  private sample!: HTMLDivElement
  private waterfallTexts: HTMLDivElement[] = []
  private info: FaceInfo | null = null
  private defaultSample = ''

  constructor(
    private readonly host: PreviewHost,
    readonly state: PreviewState
  ) {}

  /** Draws the tab for a face; keeps size, line height and typed text. */
  show(info: FaceInfo, defaultSample: string): void {
    this.info = info
    this.defaultSample = defaultSample
    const s = this.host.strings
    this.root.replaceChildren()

    const main = h('div', { class: 'fv-preview-main' })
    main.append(this.toolbar())

    this.sample = h('div', {
      class: 'fv-sample fv-face',
      contenteditable: 'plaintext-only',
      spellcheck: 'false',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': s.sampleHint,
      oninput: () => {
        const text = this.sample.textContent ?? ''
        this.state.sample = text
        this.syncTexts()
      }
    })
    this.sample.textContent = this.text()
    main.append(this.sample, h('div', { class: 'fv-hint' }, s.sampleHint))

    const waterfall = h('div', { class: 'fv-waterfall' })
    this.waterfallTexts = WATERFALL_SIZES.map((size) => {
      const text = h('div', { class: 'fv-wf-text fv-face', style: `font-size:${size}px` }, this.text())
      waterfall.append(h('div', { class: 'fv-wf-row' }, h('div', { class: 'fv-wf-size' }, String(size)), text))
      return text
    })
    main.append(h('div', { class: 'fv-block' }, h('h3', { class: 'fv-section-title' }, s.waterfall), waterfall))

    const lines = alphabetLines(info)
    if (lines.length) {
      main.append(
        h(
          'div',
          { class: 'fv-block' },
          h('h3', { class: 'fv-section-title' }, s.alphabet),
          ...lines.map((line) => h('div', { class: 'fv-alphabet fv-face' }, line))
        )
      )
    }

    const side = this.sidePanel(info)
    this.root.append(h('div', { class: 'fv-preview' }, main, side))
    this.applySize()
  }

  private text(): string {
    return this.state.sample ?? this.defaultSample
  }

  private syncTexts(): void {
    const text = this.text() || ' '
    for (const element of this.waterfallTexts) {
      element.textContent = text
    }
  }

  private toolbar(): HTMLElement {
    const s = this.host.strings
    const size = this.rangeControl(s.size, 8, 200, 1, this.state.size, (value) => `${value} px`, (value) => {
      this.state.size = value
      this.applySize()
    })
    const presets = h('div', { class: 'fv-presets', role: 'group', 'aria-label': s.size })
    for (const preset of SIZE_PRESETS) {
      presets.append(
        h(
          'button',
          {
            class: 'fv-btn ghost fv-preset',
            type: 'button',
            onclick: () => {
              this.state.size = preset
              size.set(preset)
              this.applySize()
            }
          },
          String(preset)
        )
      )
    }
    const lineHeight = this.rangeControl(s.lineHeight, 0.8, 2.5, 0.05, this.state.lineHeight, (value) => formatFixed(value, 2, this.host.language), (value) => {
      this.state.lineHeight = value
      this.applySize()
    })
    const reset = html('button', { class: 'fv-btn ghost', type: 'button', title: s.reset, 'aria-label': s.reset }, icon('reset'))
    reset.addEventListener('click', () => {
      this.state.size = DEFAULT_SIZE
      this.state.lineHeight = DEFAULT_LINE_HEIGHT
      this.state.sample = null
      this.resetAxes()
      this.state.features.clear()
      this.host.onStyleChange()
      if (this.info) this.show(this.info, this.defaultSample)
    })
    return h('div', { class: 'fv-toolbar' }, size.root, presets, lineHeight.root, reset)
  }

  private rangeControl(
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    format: (value: number) => string,
    onChange: (value: number) => void
  ): { root: HTMLElement; set(value: number): void } {
    const output = h('span', { class: 'fv-value' }, format(value))
    const input = h('input', {
      class: 'fv-range',
      type: 'range',
      min,
      max,
      step,
      value,
      'aria-label': label
    })
    paintRange(input)
    input.addEventListener('input', () => {
      const next = Number(input.value)
      output.textContent = format(next)
      paintRange(input)
      onChange(next)
    })
    return {
      root: h('label', { class: 'fv-control' }, h('span', { class: 'fv-label' }, label), input, output),
      set(next: number) {
        input.value = String(next)
        output.textContent = format(next)
        paintRange(input)
      }
    }
  }

  private applySize(): void {
    if (!this.sample) return
    this.sample.style.fontSize = `${this.state.size}px`
    this.sample.style.lineHeight = String(this.state.lineHeight)
  }

  /** Untouched axes are left to Chromium (automatic optical size, the font's defaults). */
  private resetAxes(): void {
    this.state.axes.clear()
  }

  private sidePanel(info: FaceInfo): HTMLElement | null {
    const s = this.host.strings
    const parts: HTMLElement[] = []
    const axes = info.axes
    if (axes.length) {
      parts.push(this.axesPanel(axes, info))
    }
    const entries = new Map(info.features.map((f) => [f.tag, f]))
    const features = [...entries.keys()].filter(isUserFeature).sort(compareFeatures)
    if (features.length) {
      const list = h('div', { class: 'fv-chips' })
      for (const tag of features) {
        const entry = entries.get(tag)!
        const on = this.state.features.get(tag) ?? isOnByDefault(tag)
        const name = featureName(tag, entry.uiName, this.host.language)
        const box = html('span', { class: 'fv-chip-box' }, on ? icon('check') : '')
        const chip = h(
          'button',
          {
            class: 'fv-chip',
            type: 'button',
            'aria-pressed': String(on),
            title: isOnByDefault(tag) ? `${tag} · ${s.featureOnByDefault}` : tag
          },
          box,
          h('span', { class: 'fv-chip-name' }, name),
          h('span', { class: 'fv-chip-tag' }, tag)
        )
        chip.addEventListener('click', () => {
          const next = !(this.state.features.get(tag) ?? isOnByDefault(tag))
          this.state.features.set(tag, next)
          chip.setAttribute('aria-pressed', String(next))
          box.innerHTML = next ? icon('check') : ''
          this.host.onStyleChange()
        })
        list.append(chip)
      }
      parts.push(h('div', {}, h('h3', { class: 'fv-section-title' }, s.features), list))
    }
    return parts.length ? h('aside', { class: 'fv-side' }, ...parts) : null
  }

  private axesPanel(axes: AxisInfo[], info: FaceInfo): HTMLElement {
    const s = this.host.strings
    const inputs = new Map<string, { input: HTMLInputElement; output: HTMLElement }>()
    const picker = h('select', { class: 'fv-select', 'aria-label': s.instance })
    picker.append(h('option', { value: '' }, s.instanceCustom))
    info.instances.forEach((instance, i) => picker.append(h('option', { value: String(i) }, instance.name)))

    const matchInstance = () => {
      const index = info.instances.findIndex((instance) =>
        axes.every((axis) => Math.abs((instance.coordinates[axis.tag] ?? axis.default) - (this.state.axes.get(axis.tag) ?? axis.default)) < 0.001)
      )
      picker.value = index < 0 ? '' : String(index)
    }

    picker.addEventListener('change', () => {
      const instance = info.instances[Number(picker.value)]
      if (!picker.value || !instance) return
      for (const axis of axes) {
        const value = instance.coordinates[axis.tag] ?? axis.default
        this.state.axes.set(axis.tag, value)
        const control = inputs.get(axis.tag)
        if (control) {
          control.input.value = String(value)
          control.output.textContent = formatNumber(value, this.host.language)
          control.output.removeAttribute('title')
          paintRange(control.input)
        }
      }
      this.host.onStyleChange()
    })

    const rows = axes.map((axis) => {
      const value = this.state.axes.get(axis.tag) ?? axis.default
      // step="any": a fixed step counts from the minimum and can miss the maximum (294.67–900).
      const input = h('input', {
        class: 'fv-range',
        type: 'range',
        min: axis.min,
        max: axis.max,
        step: 'any',
        value,
        'aria-label': `${axis.name} (${axis.tag})`
      })
      // Untouched, optical size follows the text size (Chromium's font-optical-sizing: auto).
      const auto = axis.tag === 'opsz' && !this.state.axes.has(axis.tag)
      const output = h(
        'span',
        { class: 'fv-value', title: auto ? s.axisAutoHint : null },
        auto ? s.axisAuto : formatNumber(value, this.host.language)
      )
      paintRange(input)
      inputs.set(axis.tag, { input, output })
      input.addEventListener('input', () => {
        const next = snapAxisValue(Number(input.value), axis)
        this.state.axes.set(axis.tag, next)
        output.textContent = formatNumber(next, this.host.language)
        output.removeAttribute('title')
        paintRange(input)
        matchInstance()
        this.host.onStyleChange()
      })
      const language = this.host.language
      const title = axis.hidden ? `${axis.tag} · ${s.hiddenAxis}` : `${axis.tag}: ${formatNumber(axis.min, language)}–${formatNumber(axis.max, language)}`
      return h(
        'div',
        { class: 'fv-axis', title },
        h('div', { class: 'fv-axis-head' }, h('span', { class: 'fv-axis-name' }, axis.name), h('span', { class: 'fv-axis-tag' }, axis.tag)),
        h('div', { class: 'fv-axis-row' }, input, output)
      )
    })
    matchInstance()
    const instanceRow = info.instances.length
      ? h('label', { class: 'fv-axis' }, h('span', { class: 'fv-label' }, s.instance), picker)
      : null
    return h('div', {}, h('h3', { class: 'fv-section-title' }, s.axes), instanceRow, ...rows)
  }
}
