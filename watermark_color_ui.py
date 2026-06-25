import os
import random
import re
from typing import List, Optional, Tuple

import folder_paths
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image


def _chunk_spans(n: int, cap: int) -> List[Tuple[int, int]]:
    if cap <= 0 or cap >= n:
        return [(0, n)]
    return [(i, min(n, i + cap)) for i in range(0, n, cap)]


def _bhwc_to_nchw(x: torch.Tensor) -> torch.Tensor:
    return x.movedim(-1, -3)


def _nchw_to_bhwc(x: torch.Tensor) -> torch.Tensor:
    return x.movedim(-3, -1)


def _normalize_color_text(value: str) -> str:
    text = str(value or "#ffffff").strip()
    if re.fullmatch(r"#[0-9a-fA-F]{3}", text):
        text = "#" + "".join(ch * 2 for ch in text[1:])
    if re.fullmatch(r"#[0-9a-fA-F]{6}", text):
        return text.lower()

    nums = re.findall(r"\d+(?:\.\d+)?", text)
    if len(nums) >= 3:
        vals = [int(max(0.0, min(255.0, float(n)))) for n in nums[:3]]
        return "#{:02x}{:02x}{:02x}".format(vals[0], vals[1], vals[2])
    return "#ffffff"


def _parse_color(value: str) -> Tuple[float, float, float]:
    text = _normalize_color_text(value)
    if re.fullmatch(r"#[0-9a-fA-F]{6}", text):
        return tuple(int(text[i : i + 2], 16) / 255.0 for i in (1, 3, 5))
    return 1.0, 1.0, 1.0


def _save_temp_preview(images: torch.Tensor, prefix: str = "watermark_color_ui"):
    output_dir = folder_paths.get_temp_directory()
    prefix = prefix + "_temp_" + "".join(random.choice("abcdefghijklmnopqrstupvxyz") for _ in range(5))
    results = []

    for batch_number, image in enumerate(images[:1]):
        arr = (255.0 * image.detach().cpu().float().clamp(0, 1).numpy()).round().astype(np.uint8)
        if arr.ndim == 3 and arr.shape[-1] == 1:
            arr = np.repeat(arr, 3, axis=-1)
        img = Image.fromarray(arr)
        file = f"{prefix}_{batch_number:05}_.png"
        img.save(os.path.join(output_dir, file), compress_level=1)
        results.append({"filename": file, "subfolder": "", "type": "temp"})

    return results


def _mask_to_alpha_nchw(mask: Optional[torch.Tensor], h: int, w: int, device: torch.device, dtype: torch.dtype) -> torch.Tensor:
    if mask is None or not isinstance(mask, torch.Tensor):
        return torch.ones(1, h, w, device=device, dtype=dtype)

    if mask.dim() == 2:
        mask = mask.unsqueeze(0)
    if mask.dim() == 4 and mask.shape[-1] == 1:
        mask = mask[..., 0]
    if mask.dim() != 3 or mask.shape[0] < 1:
        return torch.ones(1, h, w, device=device, dtype=dtype)

    m = mask[0].to(device=device, dtype=dtype).clamp(0, 1).unsqueeze(0)
    if int(m.shape[-2]) != h or int(m.shape[-1]) != w:
        m = F.interpolate(m.unsqueeze(0), size=(h, w), mode="bilinear", align_corners=False)[0]

    # Load Image outputs transparent PNG alpha as an inverted MASK:
    # transparent=1, opaque=0. For compositing we need alpha: opaque=1.
    return (1.0 - m).clamp(0, 1)


def _image_to_rgba_nchw(watermark: torch.Tensor, device: torch.device, watermark_mask: Optional[torch.Tensor] = None) -> torch.Tensor:
    if watermark is None or not isinstance(watermark, torch.Tensor):
        raise ValueError("watermark must be an IMAGE tensor from a Load Image node.")
    if watermark.dim() == 3:
        watermark = watermark.unsqueeze(0)
    if watermark.dim() != 4 or watermark.shape[0] < 1:
        raise ValueError("watermark must have shape (H,W,C) or (B,H,W,C).")

    wm = watermark[0].to(device=device, dtype=torch.float32).clamp(0, 1).movedim(-1, -3).contiguous()
    c, h, w = wm.shape
    mask_alpha = _mask_to_alpha_nchw(watermark_mask, h, w, device, wm.dtype)
    if c == 4:
        wm = wm.clone()
        wm[3:4] = wm[3:4] * mask_alpha
        return wm
    if c == 3:
        return torch.cat([wm, mask_alpha], dim=0)
    if c == 1:
        rgb = wm.repeat(3, 1, 1)
        return torch.cat([rgb, mask_alpha], dim=0)
    raise ValueError(f"Unsupported watermark channel count C={c}. Expected 1, 3 or 4.")


def _rotate_expand(x: torch.Tensor, degrees: float) -> torch.Tensor:
    deg = float(degrees) % 360.0
    if abs(deg) < 1e-6:
        return x

    n, c, h, w = x.shape
    rad = torch.tensor(deg * torch.pi / 180.0, device=x.device, dtype=x.dtype)
    cosr = float(torch.cos(rad))
    sinr = float(torch.sin(rad))
    new_w = max(1, int(abs(w * cosr) + abs(h * sinr) + 0.9999))
    new_h = max(1, int(abs(h * cosr) + abs(w * sinr) + 0.9999))

    cx_in = (w - 1) * 0.5
    cy_in = (h - 1) * 0.5
    cx_out = (new_w - 1) * 0.5
    cy_out = (new_h - 1) * 0.5

    ys = torch.linspace(0, new_h - 1, new_h, device=x.device, dtype=x.dtype)
    xs = torch.linspace(0, new_w - 1, new_w, device=x.device, dtype=x.dtype)
    gy, gx = torch.meshgrid(ys, xs, indexing="ij")

    rx = gx - cx_out
    ry = gy - cy_out
    x_in = cosr * rx + sinr * ry + cx_in
    y_in = -sinr * rx + cosr * ry + cy_in
    x_norm = (x_in + 0.5) / w * 2.0 - 1.0
    y_norm = (y_in + 0.5) / h * 2.0 - 1.0
    grid = torch.stack((x_norm, y_norm), dim=-1).unsqueeze(0).repeat(n, 1, 1, 1)

    try:
        return F.grid_sample(x, grid, mode="bicubic", padding_mode="zeros", align_corners=False)
    except Exception:
        return F.grid_sample(x, grid, mode="bilinear", padding_mode="zeros", align_corners=False)


def _blend(base: torch.Tensor, overlay: torch.Tensor, alpha: torch.Tensor, mode: str) -> torch.Tensor:
    mode = (mode or "normal").lower()
    if mode == "multiply":
        mixed = base * overlay
    elif mode == "screen":
        mixed = 1.0 - (1.0 - base) * (1.0 - overlay)
    elif mode == "overlay":
        mixed = torch.where(base <= 0.5, 2.0 * base * overlay, 1.0 - 2.0 * (1.0 - base) * (1.0 - overlay))
    elif mode == "soft_light":
        mixed = (1.0 - 2.0 * overlay) * base * base + 2.0 * overlay * base
    else:
        mixed = overlay
    return base * (1.0 - alpha) + mixed.clamp(0, 1) * alpha


class ColorWatermarkUI:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "watermark": ("IMAGE",),
                "tint_color": (
                    "STRING",
                    {"default": "#ffffff", "tooltip": "Watermark color as #RRGGBB. The visual widget includes a color picker and eyedropper."},
                ),
                "tint_strength": (
                    "FLOAT",
                    {"default": 100.0, "min": 0.0, "max": 100.0, "step": 1.0, "tooltip": "0 keeps original watermark RGB; 100 applies the selected color."},
                ),
                "preserve_luminance": (
                    "BOOLEAN",
                    {"default": False, "tooltip": "Use the original watermark brightness as shading when applying color."},
                ),
                "x_percent": (
                    "FLOAT",
                    {"default": 90.0, "min": -100.0, "max": 200.0, "step": 0.1, "tooltip": "Watermark center X as percent of image width."},
                ),
                "y_percent": (
                    "FLOAT",
                    {"default": 90.0, "min": -100.0, "max": 200.0, "step": 0.1, "tooltip": "Watermark center Y as percent of image height."},
                ),
                "scale": (
                    "FLOAT",
                    {"default": 20.0, "min": 0.1, "max": 200.0, "step": 0.1, "tooltip": "Watermark width as percent of image width."},
                ),
                "opacity": (
                    "FLOAT",
                    {"default": 90.0, "min": 0.0, "max": 100.0, "step": 1.0, "tooltip": "Watermark alpha multiplier."},
                ),
                "rotation": (
                    "FLOAT",
                    {"default": 0.0, "min": -360.0, "max": 360.0, "step": 1.0, "tooltip": "Watermark rotation in degrees."},
                ),
                "blend_mode": (
                    ["normal", "multiply", "screen", "overlay", "soft_light"],
                    {"default": "normal", "tooltip": "Color blending mode used when compositing the watermark."},
                ),
            },
            "optional": {
                "watermark_mask": (
                    "MASK",
                    {"tooltip": "Optional. Connect the MASK output from the watermark Load Image node to preserve transparent PNG alpha."},
                ),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "apply"
    OUTPUT_NODE = True
    CATEGORY = "image/post"
    DESCRIPTION = "Add a recolorable transparent watermark with an interactive position/color editor. No extra dependencies."

    def apply(
        self,
        image: torch.Tensor,
        watermark: torch.Tensor,
        tint_color: str,
        tint_strength: float,
        preserve_luminance: bool,
        x_percent: float,
        y_percent: float,
        scale: float,
        opacity: float,
        rotation: float,
        blend_mode: str,
        watermark_mask: Optional[torch.Tensor] = None,
    ):
        if image is None or not isinstance(image, torch.Tensor):
            raise ValueError("image must be a torch.Tensor with shape (H,W,C) or (B,H,W,C).")

        if image.dim() == 3:
            image = image.unsqueeze(0)
        if image.dim() != 4:
            raise ValueError(f"Unexpected IMAGE tensor rank {image.dim()}; expected 3 or 4 dims.")

        b, h, w, c = image.shape
        if c not in (1, 3, 4):
            raise ValueError(f"Unsupported channel count C={c}. Expected 1, 3 or 4.")

        # ComfyUI IMAGE tensors are normally CPU tensors. Following the input
        # device avoids surprising CUDA allocation/driver issues in portable
        # Windows environments and keeps the node dependency-light.
        device = image.device
        input_preview = image[:1].to("cpu", non_blocking=False).float().clamp(0, 1).contiguous()

        wm = _image_to_rgba_nchw(watermark, device, watermark_mask)
        rgb = wm[:3].clamp(0, 1)
        alpha = wm[3:4].clamp(0, 1)

        color = torch.tensor(_parse_color(tint_color), device=device, dtype=torch.float32).view(3, 1, 1)
        strength = max(0.0, min(1.0, float(tint_strength) / 100.0))
        if strength > 0:
            if bool(preserve_luminance):
                luma = (0.2126 * rgb[0:1] + 0.7152 * rgb[1:2] + 0.0722 * rgb[2:3]).clamp(0, 1)
                tinted = color * luma
            else:
                tinted = color.expand_as(rgb)
            rgb = rgb * (1.0 - strength) + tinted * strength

        alpha = alpha * max(0.0, min(1.0, float(opacity) / 100.0))
        premul = torch.cat([rgb * alpha, alpha], dim=0).unsqueeze(0)

        wm_h0, wm_w0 = int(premul.shape[2]), int(premul.shape[3])
        target_w = max(1, int(round(w * max(0.1, float(scale)) / 100.0)))
        target_h = max(1, int(round(wm_h0 * target_w / max(1, wm_w0))))
        resized = F.interpolate(premul, size=(target_h, target_w), mode="bicubic", align_corners=False).clamp(0, 1)
        final = _rotate_expand(resized, float(rotation))[0].clamp(0, 1)

        pm_final = final[:3]
        a_final = final[3:4]
        wm_h, wm_w = int(final.shape[1]), int(final.shape[2])
        center_x = int(round(w * float(x_percent) / 100.0))
        center_y = int(round(h * float(y_percent) / 100.0))
        x = center_x - wm_w // 2
        y = center_y - wm_h // 2

        x0 = max(0, x)
        y0 = max(0, y)
        x1 = min(w, x + wm_w)
        y1 = min(h, y + wm_h)
        if x1 <= x0 or y1 <= y0:
            out = image.to("cpu", non_blocking=False).float().clamp(0, 1).contiguous()
            return {"ui": {"watermark_input_preview": _save_temp_preview(input_preview)}, "result": (out,)}

        wx0 = x0 - x
        wy0 = y0 - y
        crop_w = x1 - x0
        crop_h = y1 - y0
        pm_crop = pm_final[:, wy0 : wy0 + crop_h, wx0 : wx0 + crop_w].contiguous()
        a_crop = a_final[:, wy0 : wy0 + crop_h, wx0 : wx0 + crop_w].contiguous()
        overlay_rgb = pm_crop / a_crop.clamp_min(1e-6)

        out_chunks: List[torch.Tensor] = []
        for start, end in _chunk_spans(b, 0):
            sub = _bhwc_to_nchw(image[start:end]).to(device=device, dtype=torch.float32, non_blocking=True).clamp(0, 1)

            if c == 1:
                rgb_base = sub.repeat(1, 3, 1, 1)
                roi = rgb_base[:, :, y0:y1, x0:x1]
                rgb_base[:, :, y0:y1, x0:x1] = _blend(roi, overlay_rgb.unsqueeze(0), a_crop.unsqueeze(0), blend_mode)
                sub = (0.2126 * rgb_base[:, 0:1] + 0.7152 * rgb_base[:, 1:2] + 0.0722 * rgb_base[:, 2:3]).clamp(0, 1)
            else:
                roi = sub[:, :3, y0:y1, x0:x1]
                sub[:, :3, y0:y1, x0:x1] = _blend(roi, overlay_rgb.unsqueeze(0), a_crop.unsqueeze(0), blend_mode)

            out_chunks.append(_nchw_to_bhwc(sub).to("cpu", non_blocking=False).clamp(0, 1))

        out = torch.cat(out_chunks, dim=0).to(dtype=torch.float32).contiguous()
        return {"ui": {"watermark_input_preview": _save_temp_preview(input_preview)}, "result": (out,)}
