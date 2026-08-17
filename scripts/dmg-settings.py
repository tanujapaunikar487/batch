# dmgbuild settings for the Batch installer window.
#   dmgbuild -s scripts/dmg-settings.py -D app=dist-mac/Batch.app "Batch" out.dmg
import os.path

app = defines.get("app", "dist-mac/Batch.app")  # noqa: F821 (provided by dmgbuild)
appname = os.path.basename(app)

format = "UDZO"
compression_level = 9
files = [app]
symlinks = {"Applications": "/Applications"}
icon = "src-tauri/icons/icon.icns"          # the mounted volume's icon

background = "assets/dmg/dmg-bg.tiff"          # 660×400 pt, 1x + 2x
window_rect = ((200, 160), (660, 400))         # (x, y), (w, h)
default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
sidebar_width = 0

icon_size = 128
text_size = 13
arrange_by = None
grid_offset = (0, 0)
scroll_position = (0, 0)
label_pos = "bottom"
icon_locations = {
    appname: (165, 200),
    "Applications": (495, 200),
}
