// Renders the app icon (1024×1024, macOS-style rounded tile with the Batch mark)
// and the menu-bar template icon (44×44 @2x, black + alpha) using CoreGraphics.
// The mark is src-tauri/icons/src/logo.svg (332×332 viewBox): one tall bar +
// three stacked bars. Usage: swift scripts/render-icons.swift <outDir>
import AppKit

let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."

func makeContext(_ size: Int) -> CGContext {
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    return CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                     space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
}

func writePNG(_ ctx: CGContext, _ path: String) {
    let img = ctx.makeImage()!
    let rep = NSBitmapImageRep(cgImage: img)
    let data = rep.representation(using: .png, properties: [:])!
    try! data.write(to: URL(fileURLWithPath: path))
    print("wrote \(path)")
}

/// The Batch mark, scaled into `box` (square). Vertically symmetric so CG's
/// bottom-left origin needs no flip.
func drawMark(_ ctx: CGContext, in box: CGRect, color: CGColor) {
    let s = box.width / 332.0
    let r = 12.0 * s
    let rects = [
        CGRect(x: 0,   y: 0,   width: 100, height: 332),
        CGRect(x: 111, y: 0,   width: 221, height: 100),
        CGRect(x: 111, y: 116, width: 221, height: 100),
        CGRect(x: 111, y: 232, width: 221, height: 100),
    ]
    ctx.setFillColor(color)
    for rr in rects {
        let scaled = CGRect(x: box.minX + rr.minX * s, y: box.minY + rr.minY * s,
                            width: rr.width * s, height: rr.height * s)
        ctx.addPath(CGPath(roundedRect: scaled, cornerWidth: r, cornerHeight: r, transform: nil))
        ctx.fillPath()
    }
}

// ---------- App icon ----------
do {
    let S = 1024
    let ctx = makeContext(S)
    ctx.clear(CGRect(x: 0, y: 0, width: S, height: S))

    // Big Sur icon grid: 824pt tile centred, radius ≈ 22.5%
    let side: CGFloat = 824
    let inset = (CGFloat(S) - side) / 2
    let tile = CGRect(x: inset, y: inset, width: side, height: side)
    let radius = side * 0.225
    let tilePath = CGPath(roundedRect: tile, cornerWidth: radius, cornerHeight: radius, transform: nil)

    // Shadow
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -14), blur: 40, color: CGColor(gray: 0, alpha: 0.30))
    ctx.addPath(tilePath)
    ctx.setFillColor(CGColor(gray: 1, alpha: 1))
    ctx.fillPath()
    ctx.restoreGState()

    // Tile: soft white gradient + hairline
    ctx.saveGState()
    ctx.addPath(tilePath)
    ctx.clip()
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    let colors = [CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1),
                  CGColor(srgbRed: 0.93, green: 0.93, blue: 0.94, alpha: 1)] as CFArray
    let grad = CGGradient(colorsSpace: cs, colors: colors, locations: [0, 1])!
    ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: tile.maxY), end: CGPoint(x: 0, y: tile.minY), options: [])
    ctx.setStrokeColor(CGColor(gray: 0, alpha: 0.10))
    ctx.setLineWidth(4)
    ctx.addPath(CGPath(roundedRect: tile.insetBy(dx: 2, dy: 2), cornerWidth: radius - 2, cornerHeight: radius - 2, transform: nil))
    ctx.strokePath()
    ctx.restoreGState()

    // Mark: ~50% of the tile, centred
    let markSide = side * 0.50
    let markBox = CGRect(x: tile.midX - markSide / 2, y: tile.midY - markSide / 2, width: markSide, height: markSide)
    drawMark(ctx, in: markBox, color: CGColor(srgbRed: 0.09, green: 0.09, blue: 0.10, alpha: 1))

    writePNG(ctx, "\(outDir)/app-icon.png")
}

// ---------- Menu bar (template) icon ----------
do {
    let S = 44 // 22pt @2x
    let ctx = makeContext(S)
    ctx.clear(CGRect(x: 0, y: 0, width: S, height: S))
    let f = CGFloat(S)
    let box = CGRect(x: 6, y: 6, width: f - 12, height: f - 12)
    drawMark(ctx, in: box, color: CGColor(gray: 0, alpha: 1))
    writePNG(ctx, "\(outDir)/tray.png")
}
