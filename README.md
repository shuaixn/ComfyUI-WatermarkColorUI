# ComfyUI Watermark Color UI

[中文说明](#中文说明) | [English](#english)

---

## 中文说明

`Watermark Color UI` 是一个给图片添加可调色水印的 ComfyUI 自定义节点。它适合透明 PNG 水印，可以在节点内直接选色、吸色、拖动位置、缩放、旋转，并预览水印叠加效果。

### 功能

- 支持透明 PNG 水印。
- 支持水印颜色选择和浏览器吸色器。
- 支持透明度、染色强度、保留明暗、混合模式。
- 支持拖动水印位置、右下角缩放、右上角旋转。
- 支持中轴线提示和中心磁吸。
- 支持旋转接近 0、90、180、-90 度时的角度磁吸提示。
- 支持 `S / M / L` 三档固定预览高度。
- 支持通过 ComfyUI 原生运行按钮执行上游节点，例如 Resize 节点。

### 安装

把本仓库放到 ComfyUI 的 `custom_nodes` 目录下：

```text
ComfyUI/custom_nodes/ComfyUI-WatermarkColorUI
```

然后重启 ComfyUI，并在浏览器中强制刷新页面。

### 推荐连接

1. `Load Image` 加载主图，连接到 `Watermark Color UI.image`。
2. 另一个 `Load Image` 加载透明 PNG 水印，连接到 `Watermark Color UI.watermark`。
3. 如果水印是透明 PNG，把同一个水印 `Load Image` 的 `mask / 遮罩` 输出连接到 `Watermark Color UI.watermark_mask`。
4. `Watermark Color UI.image` 输出最终加水印结果。

`watermark_mask` 用来保留透明 PNG 的透明区域。不连接它时，ComfyUI 可能只把水印当成普通 RGB 图像，输出会变成矩形色块。

### 使用说明

- 点击颜色块选择水印颜色。
- 点击 `Pick / 吸色` 使用浏览器吸色器。
- 如果主图前面接了 Resize 等中间节点，请点击节点上方的 ComfyUI 原生运行按钮。节点会执行上游流程，并用实际输入到水印节点的图像刷新预览。
- 点击 `S / M / L` 切换固定预览高度。
- 拖动水印框调整位置。
- 拖动右下角方块调整大小。
- 拖动右上角圆点调整旋转。
- 开启 `Guides / 中轴线` 时，靠近画面中心会显示红色横/纵中轴线，并自动吸附到中心。
- 水印框内部红色中线只会在旋转接近 0、90、180、-90 度并触发磁吸时显示。

### 控件说明

- `Opacity / 透明度`：水印整体透明度。
- `Tint / 染色`：染色强度。100 表示完全使用选定颜色，0 表示保留原水印颜色。
- `Luma / 明暗`：保留原水印明暗，让笔触和渐变保留深浅。
- `Blend / 混合`：混合模式。`normal` 普通叠加；`multiply` 压暗；`screen` 提亮；`overlay` 增强对比；`soft_light` 更柔和。
- `Guides / 中轴线`：中轴线显示与磁吸开关。

### 依赖

没有额外 Python 或 npm 依赖。

节点只使用 ComfyUI 环境通常已经包含的依赖：

- `torch`
- `Pillow`
- `numpy`
- ComfyUI 内置的 `folder_paths`

### 目录结构

```text
ComfyUI-WatermarkColorUI/
├─ __init__.py
├─ watermark_color_ui.py
├─ README.md
├─ .gitignore
└─ web/
   └─ watermark_dom_editor.js
```

### 注意事项

- 透明 PNG 水印建议同时连接 `image` 和 `mask` 输出。
- 浏览器吸色器依赖浏览器支持 `EyeDropper` API；如果不支持，可以直接点击颜色块选色。
- 运行上游 Resize、裁剪等节点时，请使用 ComfyUI 节点上方的原生运行按钮。

---

## English

`Watermark Color UI` is a ComfyUI custom node for adding recolorable watermarks to images. It is designed for transparent PNG watermarks and provides an interactive in-node editor for picking colors, sampling colors, dragging, scaling, rotating, and previewing the watermark.

### Features

- Transparent PNG watermark support.
- Color picker and browser eyedropper support.
- Opacity, tint strength, luminance preservation, and blend modes.
- Drag to position, drag the bottom-right handle to scale, and drag the top-right handle to rotate.
- Center guides and center snapping.
- Rotation snapping near 0, 90, 180, and -90 degrees.
- Fixed `S / M / L` preview height presets.
- Supports running upstream nodes, such as Resize nodes, through ComfyUI's native node run button.

### Installation

Place this repository under ComfyUI's `custom_nodes` directory:

```text
ComfyUI/custom_nodes/ComfyUI-WatermarkColorUI
```

Then restart ComfyUI and hard-refresh the browser page.

### Recommended Wiring

1. Use `Load Image` for the main image and connect it to `Watermark Color UI.image`.
2. Use another `Load Image` for the transparent PNG watermark and connect it to `Watermark Color UI.watermark`.
3. If the watermark is a transparent PNG, connect the same watermark `Load Image` node's `mask` output to `Watermark Color UI.watermark_mask`.
4. Use `Watermark Color UI.image` as the final watermarked image output.

`watermark_mask` preserves the transparent areas of PNG watermarks. Without it, ComfyUI may pass only an RGB image, which can produce a rectangular color block instead of a shaped watermark.

### Usage

- Click the color swatch to choose a watermark color.
- Click `Pick` to use the browser eyedropper.
- If the main image passes through upstream nodes such as Resize, click ComfyUI's native run button above this node. The node will execute the upstream chain and refresh the preview with the actual image received by the watermark node.
- Click `S / M / L` to switch fixed preview heights.
- Drag the watermark box to move it.
- Drag the bottom-right square handle to scale it.
- Drag the top-right round handle to rotate it.
- Enable `Guides` to show red center guides and snap near the image center.
- Red center lines inside the watermark box appear only while rotation snaps near 0, 90, 180, or -90 degrees.

### Controls

- `Opacity`: Overall watermark opacity.
- `Tint`: Tint strength. `100` fully applies the selected color; `0` keeps the original watermark color.
- `Luma`: Preserves original watermark luminance, keeping strokes and gradients visually shaded.
- `Blend`: Blend mode. `normal`, `multiply`, `screen`, `overlay`, and `soft_light` are supported.
- `Guides`: Center guide display and snapping.

### Dependencies

No extra Python or npm dependencies are required.

The node only uses dependencies normally bundled with ComfyUI:

- `torch`
- `Pillow`
- `numpy`
- ComfyUI's built-in `folder_paths`

### Folder Structure

```text
ComfyUI-WatermarkColorUI/
├─ __init__.py
├─ watermark_color_ui.py
├─ README.md
├─ .gitignore
└─ web/
   └─ watermark_dom_editor.js
```

### Notes

- For transparent PNG watermarks, connect both the `image` and `mask` outputs from the watermark `Load Image` node.
- The eyedropper depends on browser support for the `EyeDropper` API. If unsupported, use the color swatch directly.
- To execute upstream Resize, crop, or processing nodes, use ComfyUI's native run button above the node.
