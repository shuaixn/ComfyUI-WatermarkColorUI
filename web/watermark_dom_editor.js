import { app } from "../../scripts/app.js";

const NODE_TYPE = "WatermarkColorUI";
const STAGE_HEIGHTS = {
  small: 360,
  medium: 720,
  large: 1080,
};
const WIDGET_CHROME_HEIGHT = 150;
const HANDLE_SAFE_PADDING = 24;
const NODE_SHELL_HEIGHT = 92;
const SNAP_ANGLE_THRESHOLD = 4;

function isChineseLocale() {
  const setting = app?.ui?.settings?.getSettingValue?.("Comfy.Locale");
  const stored = localStorage.getItem("Comfy.Locale");
  const locale = String(setting || stored || navigator.language || "").toLowerCase();
  return locale.startsWith("zh");
}

function tr(en, zh) {
  return isChineseLocale() ? zh : en;
}

function widget(node, name) {
  return node.widgets?.find((item) => item.name === name);
}

function setWidget(node, name, value) {
  const w = widget(node, name);
  if (!w) return;
  w.value = value;
  w.callback?.(value, null, node);
  node.setDirtyCanvas?.(true, true);
}

function num(node, name, fallback) {
  const value = Number(widget(node, name)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeHex(value) {
  let text = String(value || "#ffffff").trim();
  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    text = "#" + text.slice(1).split("").map((c) => c + c).join("");
  }
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : "#ffffff";
}

function imageUrl(value) {
  if (!value) return "";
  let text = String(value);
  let type = "input";
  const match = text.match(/\s+\[(input|output|temp)\]$/);
  if (match) {
    type = match[1];
    text = text.slice(0, match.index);
  }
  const parts = text.replaceAll("\\", "/").split("/");
  const filename = parts.pop();
  const subfolder = parts.join("/");
  return `/view?${new URLSearchParams({ filename, subfolder, type }).toString()}`;
}

function previewRecordUrl(record) {
  if (!record?.filename) return "";
  const params = new URLSearchParams({
    filename: record.filename,
    subfolder: record.subfolder || "",
    type: record.type || "temp",
  });
  return `/view?${params.toString()}`;
}

function linkedNode(node, inputName) {
  const input = node.inputs?.find((item) => item.name === inputName);
  const link = input?.link != null ? app.graph?.links?.[input.link] : null;
  return link?.origin_id != null ? app.graph?.getNodeById?.(link.origin_id) : null;
}

function linkedLoadImageUrl(node) {
  return linkedImageUrl(node, "image");
}

function linkedWatermarkUrl(node) {
  return linkedImageUrl(node, "watermark");
}

function nodePreviewUrl(node) {
  const imageIndex = Number.isInteger(node.imageIndex) ? node.imageIndex : 0;
  const previewImage = node.imgs?.[imageIndex] || node.imgs?.[0];
  if (previewImage?.currentSrc) return previewImage.currentSrc;
  if (previewImage?.src) return previewImage.src;
  return "";
}

function linkedImageUrl(node, inputName) {
  const sourceNode = linkedNode(node, inputName);
  if (!sourceNode) return "";
  const previewUrl = nodePreviewUrl(sourceNode);
  if (previewUrl) return previewUrl;
  const imageWidget = sourceNode?.widgets?.find((item) => item.name === "image");
  return imageUrl(imageWidget?.value || "");
}

const SYNC_WIDGET_NAMES = [
  "tint_color",
  "tint_strength",
  "preserve_luminance",
  "x_percent",
  "y_percent",
  "scale",
  "opacity",
  "rotation",
  "blend_mode",
];

function hideSyncWidgets(node) {
  for (const name of SYNC_WIDGET_NAMES) {
    const w = widget(node, name);
    if (!w || w.__wmEditorHidden) continue;
    w.__wmEditorHidden = true;
    w.__wmEditorOriginalType = w.type;
    w.__wmEditorOriginalComputeSize = w.computeSize;
    w.__wmEditorOriginalDraw = w.draw;
    w.type = "converted-widget";
    w.computeSize = () => [0, 0];
    w.draw = () => {};
  }
}

function installStyles() {
  if (document.getElementById("wm-color-ui-style")) return;
  const style = document.createElement("style");
  style.id = "wm-color-ui-style";
  style.textContent = `
    .wm-color-ui {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      padding: 8px;
      color: var(--fg-color, #ddd);
      font: 12px sans-serif;
      background: #262626;
      border: 1px solid #555;
      border-radius: 6px;
      user-select: none;
    }
    .wm-color-ui * { box-sizing: border-box; }
    .wm-color-ui-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 28px;
      margin-bottom: 6px;
      white-space: nowrap;
    }
    .wm-color-ui-size {
      display: flex;
      gap: 4px;
      margin-left: auto;
    }
    .wm-color-ui-size button.active {
      border-color: #8bbfff;
      background: #315985;
    }
    .wm-color-ui-controls {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 10px;
      margin-bottom: 6px;
    }
    .wm-color-ui-control {
      display: grid;
      grid-template-columns: 58px 1fr;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .wm-color-ui-control span {
      color: #ccc;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .wm-color-ui-control input[type="range"],
    .wm-color-ui-control select {
      width: 100%;
      min-width: 0;
    }
    .wm-color-ui-control input[type="checkbox"] {
      justify-self: start;
    }
    .wm-color-ui-toolbar input[type="color"] {
      width: 48px;
      height: 24px;
      padding: 0;
      border: 1px solid #777;
      background: transparent;
    }
    .wm-color-ui-toolbar button {
      height: 24px;
      padding: 0 10px;
      border: 1px solid #666;
      border-radius: 4px;
      color: #ddd;
      background: #343434;
      cursor: pointer;
    }
    .wm-color-ui-stage {
      position: relative;
      height: ${STAGE_HEIGHTS.medium}px;
      overflow: hidden;
      border: 1px solid #555;
      background-color: #1b1b1b;
      background-image:
        linear-gradient(45deg, #242424 25%, transparent 25%),
        linear-gradient(-45deg, #242424 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #242424 75%),
        linear-gradient(-45deg, transparent 75%, #242424 75%);
      background-position: 0 0, 0 8px, 8px -8px, -8px 0;
      background-size: 16px 16px;
    }
    .wm-color-ui-image-area {
      position: absolute;
      overflow: hidden;
      background: #111;
      outline: 1px solid #777;
    }
    .wm-color-ui-base {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
      pointer-events: none;
    }
    .wm-color-ui-watermark {
      position: absolute;
      transform-origin: center center;
      cursor: move;
      border: 2px dashed rgba(255,255,255,.95);
      box-shadow: 0 0 0 1px rgba(0,0,0,.75);
      z-index: 3;
    }
    .wm-color-ui-watermark-fill {
      position: absolute;
      inset: 0;
      background: #fff;
      pointer-events: none;
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-size: 100% 100%;
      mask-size: 100% 100%;
      -webkit-mask-position: center;
      mask-position: center;
    }
    .wm-color-ui-handle {
      position: absolute;
      right: -6px;
      bottom: -6px;
      width: 14px;
      height: 14px;
      border: 1px solid #222;
      background: #fff;
      cursor: nwse-resize;
      z-index: 2;
    }
    .wm-color-ui-rotate-handle {
      position: absolute;
      top: -9px;
      right: -9px;
      width: 16px;
      height: 16px;
      border: 2px solid #222;
      border-radius: 50%;
      background: #7db7ff;
      cursor: grab;
      z-index: 2;
    }
    .wm-color-ui-mark-guide {
      position: absolute;
      pointer-events: none;
      z-index: 1;
      background: rgba(255, 70, 70, .95);
    }
    .wm-color-ui-mark-guide-x {
      top: 50%;
      left: 0;
      width: 100%;
      height: 1px;
    }
    .wm-color-ui-mark-guide-y {
      top: 0;
      left: 50%;
      width: 1px;
      height: 100%;
    }
    .wm-color-ui-guide {
      position: absolute;
      display: none;
      pointer-events: none;
      z-index: 2;
      background: rgba(255, 70, 70, .95);
      box-shadow: 0 0 0 1px rgba(0,0,0,.35);
    }
    .wm-color-ui-guide-x {
      top: 50%;
      left: 0;
      width: 100%;
      height: 1px;
    }
    .wm-color-ui-guide-y {
      top: 0;
      left: 50%;
      width: 1px;
      height: 100%;
    }
    .wm-color-ui-guide.visible {
      display: block;
    }
  `;
  document.head.appendChild(style);
}

function addEditor(node) {
  if (node.__wmColorEditor || typeof node.addDOMWidget !== "function") return;
  node.__wmColorEditor = true;
  installStyles();
  hideSyncWidgets(node);

  const root = document.createElement("div");
  root.className = "wm-color-ui";
  root.innerHTML = `
    <div class="wm-color-ui-toolbar">
      <input class="wm-color-ui-color" type="color" title="Watermark color" />
      <button class="wm-color-ui-pick" type="button">Pick</button>
      <span class="wm-color-ui-label">#ffffff</span>
      <span class="wm-color-ui-size"><button type="button" data-size="small">S</button><button type="button" data-size="medium" class="active">M</button><button type="button" data-size="large">L</button></span>
    </div>
    <div class="wm-color-ui-controls">
      <label class="wm-color-ui-control"><span>Opacity</span><input class="wm-color-ui-opacity" type="range" min="0" max="100" step="1" /></label>
      <label class="wm-color-ui-control"><span>Tint</span><input class="wm-color-ui-strength" type="range" min="0" max="100" step="1" /></label>
      <label class="wm-color-ui-control"><span>Luma</span><input class="wm-color-ui-luma" type="checkbox" /></label>
      <label class="wm-color-ui-control"><span>Blend</span><select class="wm-color-ui-blend"><option>normal</option><option>multiply</option><option>screen</option><option>overlay</option><option>soft_light</option></select></label>
      <label class="wm-color-ui-control"><span>Guides</span><input class="wm-color-ui-guides" type="checkbox" checked /></label>
    </div>
    <div class="wm-color-ui-stage">
      <div class="wm-color-ui-image-area">
        <div class="wm-color-ui-guide wm-color-ui-guide-x"></div>
        <div class="wm-color-ui-guide wm-color-ui-guide-y"></div>
        <img class="wm-color-ui-base" />
        <div class="wm-color-ui-watermark"><div class="wm-color-ui-watermark-fill"></div><div class="wm-color-ui-mark-guide wm-color-ui-mark-guide-x"></div><div class="wm-color-ui-mark-guide wm-color-ui-mark-guide-y"></div><div class="wm-color-ui-rotate-handle"></div><div class="wm-color-ui-handle"></div></div>
      </div>
    </div>
  `;

  const colorInput = root.querySelector(".wm-color-ui-color");
  const pickButton = root.querySelector(".wm-color-ui-pick");
  const refreshButton = root.querySelector(".wm-color-ui-refresh");
  const label = root.querySelector(".wm-color-ui-label");
  const sizeButtons = [...root.querySelectorAll(".wm-color-ui-size button")];
  const opacityInput = root.querySelector(".wm-color-ui-opacity");
  const strengthInput = root.querySelector(".wm-color-ui-strength");
  const lumaInput = root.querySelector(".wm-color-ui-luma");
  const blendInput = root.querySelector(".wm-color-ui-blend");
  const guidesInput = root.querySelector(".wm-color-ui-guides");
  const stage = root.querySelector(".wm-color-ui-stage");
  const area = root.querySelector(".wm-color-ui-image-area");
  const guideX = root.querySelector(".wm-color-ui-guide-x");
  const guideY = root.querySelector(".wm-color-ui-guide-y");
  const base = root.querySelector(".wm-color-ui-base");
  const mark = root.querySelector(".wm-color-ui-watermark");
  const markFill = root.querySelector(".wm-color-ui-watermark-fill");
  const handle = root.querySelector(".wm-color-ui-handle");
  const rotateHandle = root.querySelector(".wm-color-ui-rotate-handle");

  function localize() {
    const pairs = [
      [pickButton, "Pick", "吸色", "Pick a color from the screen when supported.", "浏览器支持时，可从屏幕吸取颜色。"],
      [refreshButton, "Refresh", "刷新", "Reload the connected image and watermark preview.", "重新读取已连接的图片和水印预览。"],
      [opacityInput, "", "", "Watermark opacity.", "水印透明度。"],
      [strengthInput, "", "", "Tint strength. 100 fully uses the selected color; 0 keeps the original watermark color.", "染色强度。100 完全使用选定颜色；0 保留水印原本颜色。"],
      [lumaInput, "", "", "Preserve original watermark luminance so strokes and gradients keep their depth.", "保留水印原本明暗，让笔触和渐变保留深浅。"],
      [blendInput, "", "", "Blend mode. Normal is standard; multiply darkens; screen brightens; overlay adds contrast; soft light is gentler.", "混合模式。normal 普通叠加；multiply 压暗；screen 提亮；overlay 增强对比；soft_light 更柔和。"],
      [guidesInput, "", "", "Show red center guides and snap near the image center.", "显示红色中轴线，并在靠近中心时磁吸。"],
      [handle, "", "", "Drag to resize the watermark.", "拖动调整水印大小。"],
      [rotateHandle, "", "", "Drag to rotate. Snaps near 0, 90, 180 and -90 degrees.", "拖动旋转。靠近 0、90、180、-90 度时会磁吸。"],
      [colorInput, "", "", "Watermark tint color.", "水印染色颜色。"],
    ];
    for (const [el, enText, zhText, enTitle, zhTitle] of pairs) {
      if (!el) continue;
      if (enText) el.textContent = tr(enText, zhText);
      el.title = tr(enTitle, zhTitle);
    }

    const labels = root.querySelectorAll(".wm-color-ui-control span");
    const labelTexts = [
      ["Opacity", "透明度"],
      ["Tint", "染色"],
      ["Luma", "明暗"],
      ["Blend", "混合"],
      ["Guides", "中轴线"],
    ];
    labels.forEach((el, index) => {
      const pair = labelTexts[index];
      if (pair) el.textContent = tr(pair[0], pair[1]);
    });
    for (const button of sizeButtons) {
      button.title = tr("Preview height preset.", "预览高度档位。");
    }
  }

  localize();

  const state = {
    baseUrl: "",
    wmUrl: "",
    baseRatio: 1,
    wmRatio: 0.35,
    mode: "",
    guides: true,
    stageSize: "medium",
    showMarkGuides: false,
  };

  function widgetHeight(size = state.stageSize) {
    return (STAGE_HEIGHTS[size] || STAGE_HEIGHTS.medium) + WIDGET_CHROME_HEIGHT;
  }

  function targetNodeHeight(size = state.stageSize) {
    return widgetHeight(size) + NODE_SHELL_HEIGHT;
  }

  function fitNodeToEditor() {
    node.imgs = undefined;
    node.imageIndex = null;
    node.overIndex = null;
    node.setSize?.([Math.max(node.size?.[0] || 360, 360), targetNodeHeight(state.stageSize)]);
    node.setDirtyCanvas?.(true, true);
  }

  function fitNodeSoon() {
    requestAnimationFrame(() => {
      fitNodeToEditor();
      requestAnimationFrame(fitNodeToEditor);
    });
  }

  function setStageSize(size) {
    state.stageSize = STAGE_HEIGHTS[size] ? size : "medium";
    node.properties = node.properties || {};
    node.properties.wm_stage_size = state.stageSize;
    sizeButtons.forEach((item) => item.classList.toggle("active", item.dataset.size === state.stageSize));
  }

  function refreshImages(force = false) {
    const nextBase = linkedLoadImageUrl(node) || nodePreviewUrl(node);
    if (nextBase && (force || nextBase !== state.baseUrl)) {
      state.baseUrl = nextBase;
      base.onload = () => {
        state.baseRatio = base.naturalWidth / Math.max(1, base.naturalHeight);
        update();
      };
      base.src = `${nextBase}&_=${Date.now()}`;
    }

    const nextWm = linkedWatermarkUrl(node);
    if (nextWm && (force || nextWm !== state.wmUrl)) {
      state.wmUrl = nextWm;
      const probe = new Image();
      probe.onload = () => {
        state.wmRatio = probe.naturalHeight / Math.max(1, probe.naturalWidth);
        update();
      };
      probe.src = `${nextWm}&_=${Date.now()}`;
      markFill.style.webkitMaskImage = `url("${nextWm}")`;
      markFill.style.maskImage = `url("${nextWm}")`;
    }
  }

  function update() {
    refreshImages();
    node.imgs = undefined;
    node.imageIndex = null;
    stage.style.height = `${STAGE_HEIGHTS[state.stageSize] || STAGE_HEIGHTS.medium}px`;

    const color = normalizeHex(widget(node, "tint_color")?.value);
    colorInput.value = color;
    label.textContent = color;
    opacityInput.value = String(num(node, "opacity", 90));
    strengthInput.value = String(num(node, "tint_strength", 100));
    lumaInput.checked = !!widget(node, "preserve_luminance")?.value;
    blendInput.value = String(widget(node, "blend_mode")?.value || "normal");
    guidesInput.checked = state.guides;
    markFill.style.background = color;
    markFill.style.opacity = String(clamp(num(node, "opacity", 100) / 100, 0, 1));

    const stageW = Math.max(1, stage.clientWidth || 1);
    const stageH = Math.max(1, stage.clientHeight || 1);
    const maxW = Math.max(1, stageW - HANDLE_SAFE_PADDING * 2);
    const maxH = Math.max(1, stageH - HANDLE_SAFE_PADDING * 2);
    let areaW = maxW;
    let areaH = maxW / state.baseRatio;
    if (areaH > maxH) {
      areaH = maxH;
      areaW = maxH * state.baseRatio;
    }

    area.style.width = `${areaW}px`;
    area.style.height = `${areaH}px`;
    area.style.left = `${(stageW - areaW) / 2}px`;
    area.style.top = `${(stageH - areaH) / 2}px`;

    const wmW = Math.max(8, areaW * num(node, "scale", 20) / 100);
    const wmH = Math.max(8, wmW * state.wmRatio);
    const cx = areaW * num(node, "x_percent", 50) / 100;
    const cy = areaH * num(node, "y_percent", 50) / 100;
    const rotation = num(node, "rotation", 0);

    mark.style.width = `${wmW}px`;
    mark.style.height = `${wmH}px`;
    mark.style.left = `${cx - wmW / 2}px`;
    mark.style.top = `${cy - wmH / 2}px`;
    mark.style.transform = `rotate(${rotation}deg)`;
    mark.querySelectorAll(".wm-color-ui-mark-guide").forEach((el) => {
      el.style.display = state.showMarkGuides ? "block" : "none";
    });
  }

  function setGuideVisibility(showX, showY) {
    guideX.classList.toggle("visible", !!showX && state.guides);
    guideY.classList.toggle("visible", !!showY && state.guides);
  }

  function refreshPreview() {
    refreshImages(true);
    update();
  }

  function setFromPointer(event) {
    const rect = area.getBoundingClientRect();
    let x = clamp((event.clientX - rect.left) / Math.max(1, rect.width) * 100, -100, 200);
    let y = clamp((event.clientY - rect.top) / Math.max(1, rect.height) * 100, -100, 200);
    const snapThreshold = 3.0;
    const nearX = Math.abs(x - 50) <= snapThreshold;
    const nearY = Math.abs(y - 50) <= snapThreshold;
    if (state.guides && nearX) x = 50;
    if (state.guides && nearY) y = 50;
    setGuideVisibility(nearY, nearX);
    setWidget(node, "x_percent", Math.round(x * 10) / 10);
    setWidget(node, "y_percent", Math.round(y * 10) / 10);
    update();
  }

  function scaleFromPointer(event) {
    const rect = area.getBoundingClientRect();
    const cx = rect.left + rect.width * num(node, "x_percent", 50) / 100;
    const widthPercent = Math.abs(event.clientX - cx) * 2 / Math.max(1, rect.width) * 100;
    setWidget(node, "scale", Math.round(clamp(widthPercent, 0.1, 200) * 10) / 10);
    update();
  }

  function rotateFromPointer(event) {
    const rect = area.getBoundingClientRect();
    const cx = rect.left + rect.width * num(node, "x_percent", 50) / 100;
    const cy = rect.top + rect.height * num(node, "y_percent", 50) / 100;
    const angle = Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI + 45;
    let normalized = Math.round((((angle + 540) % 360) - 180));
    let snapped = false;
    for (const snap of [-180, -90, 0, 90, 180]) {
      if (Math.abs(normalized - snap) <= SNAP_ANGLE_THRESHOLD) {
        normalized = snap === -180 ? 180 : snap;
        snapped = true;
        break;
      }
    }
    state.showMarkGuides = snapped;
    setWidget(node, "rotation", normalized);
    update();
  }

  colorInput.addEventListener("input", () => {
    setWidget(node, "tint_color", colorInput.value);
    update();
  });

  opacityInput.addEventListener("input", () => {
    setWidget(node, "opacity", Number(opacityInput.value));
    update();
  });

  strengthInput.addEventListener("input", () => {
    setWidget(node, "tint_strength", Number(strengthInput.value));
    update();
  });

  lumaInput.addEventListener("change", () => {
    setWidget(node, "preserve_luminance", lumaInput.checked);
    update();
  });

  blendInput.addEventListener("change", () => {
    setWidget(node, "blend_mode", blendInput.value);
    update();
  });

  guidesInput.addEventListener("change", () => {
    state.guides = guidesInput.checked;
    setGuideVisibility(false, false);
  });

  for (const button of sizeButtons) {
    button.addEventListener("click", () => {
      setStageSize(button.dataset.size || "medium");
      update();
      fitNodeSoon();
    });
  }

  pickButton.addEventListener("click", async () => {
    if (state.picking) return;
    if (!window.EyeDropper) {
      colorInput.click();
      return;
    }

    state.picking = true;
    pickButton.disabled = true;
    pickButton.blur();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const result = await new window.EyeDropper().open({ signal: controller.signal });
      if (result?.sRGBHex) {
        setWidget(node, "tint_color", result.sRGBHex);
        update();
      }
    } catch (_) {
      // Cancel, timeout, and unsupported picker failures should all return the UI
      // to normal without surfacing a blocking dialog in ComfyUI.
    } finally {
      clearTimeout(timeout);
      state.picking = false;
      pickButton.disabled = false;
      pickButton.blur();
      app.canvas?.canvas?.focus?.();
    }
  });

  mark.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    state.mode = "move";
    mark.setPointerCapture(event.pointerId);
    setFromPointer(event);
  });

  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    state.mode = "scale";
    handle.setPointerCapture(event.pointerId);
    scaleFromPointer(event);
  });

  rotateHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    state.mode = "rotate";
    rotateHandle.setPointerCapture(event.pointerId);
    rotateFromPointer(event);
  });

  root.addEventListener("pointermove", (event) => {
    if (state.mode === "move") setFromPointer(event);
    if (state.mode === "scale") scaleFromPointer(event);
    if (state.mode === "rotate") rotateFromPointer(event);
  });

  root.addEventListener("pointerup", () => {
    state.mode = "";
    state.showMarkGuides = false;
    setGuideVisibility(false, false);
    update();
  });

  root.addEventListener("pointercancel", () => {
    state.mode = "";
    state.showMarkGuides = false;
    setGuideVisibility(false, false);
    update();
  });

  node.addDOMWidget("watermark_editor", "watermark_editor", root, {
    getMinHeight: () => widgetHeight(),
    getMaxHeight: () => widgetHeight(),
    hideOnZoom: true,
    getValue: () => "",
    setValue: () => {},
  });

  hideSyncWidgets(node);

  for (const name of ["tint_color", "tint_strength", "preserve_luminance", "x_percent", "y_percent", "scale", "opacity", "rotation"]) {
    const w = widget(node, name);
    if (!w || w.__wmEditorPatched) continue;
    w.__wmEditorPatched = true;
    const oldCallback = w.callback;
    w.callback = function () {
      const result = oldCallback?.apply(this, arguments);
      requestAnimationFrame(update);
      return result;
    };
  }

  const oldOnResize = node.onResize;
  node.onResize = function () {
    const result = oldOnResize?.apply(this, arguments);
    requestAnimationFrame(update);
    return result;
  };

  const oldOnConnectionsChange = node.onConnectionsChange;
  node.onConnectionsChange = function () {
    const result = oldOnConnectionsChange?.apply(this, arguments);
    requestAnimationFrame(() => {
      update();
      fitNodeSoon();
    });
    return result;
  };

  const oldOnExecuted = node.onExecuted;
  node.onExecuted = function (message) {
    const result = oldOnExecuted?.apply(this, arguments);
    const preview = previewRecordUrl(message?.watermark_input_preview?.[0] || message?.output?.watermark_input_preview?.[0]);
    requestAnimationFrame(() => {
      if (preview) {
        state.baseUrl = "";
        base.onload = () => {
          state.baseRatio = base.naturalWidth / Math.max(1, base.naturalHeight);
          update();
        };
        base.src = `${preview}&_=${Date.now()}`;
      } else {
        refreshPreview();
      }
      node.imgs = undefined;
      node.imageIndex = null;
      fitNodeSoon();
    });
    return result;
  };

  requestAnimationFrame(() => {
    setStageSize(node.properties?.wm_stage_size || state.stageSize);
    update();
    fitNodeSoon();
  });
}

app.registerExtension({
  name: "WatermarkColorUI.DOMEditor",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== NODE_TYPE) return;
    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated?.apply(this, arguments);
      addEditor(this);
      return result;
    };
  },
});
