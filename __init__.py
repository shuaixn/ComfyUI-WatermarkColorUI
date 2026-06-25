import os
import sys

NODE_DIR = os.path.dirname(__file__)
if NODE_DIR not in sys.path:
    sys.path.insert(0, NODE_DIR)

from watermark_color_ui import ColorWatermarkUI

NODE_CLASS_MAPPINGS = {
    "WatermarkColorUI": ColorWatermarkUI,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "WatermarkColorUI": "Watermark Color UI",
}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
