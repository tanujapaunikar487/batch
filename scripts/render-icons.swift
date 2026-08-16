// Renders the app icon (1024×1024, macOS-style rounded square) and the
// menu-bar template icon (44×44 @2x, black + alpha) using CoreGraphics.
// Usage: swift scripts/render-icons.swift <outDir>
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

/// Checkmark path in unit space (0…1, origin bottom-left as CG uses).
func checkPath(in rect: CGRect) -> CGPath {
    let p = CGMutablePath()
    let x = rect.minX, y = rect.minY, w = rect.width, h = rect.height
    p.move(to: CGPoint(x: x + 0.24 * w, y: y + 0.50 * h))
    p.addLine(to: CGPoint(x: x + 0.42 * w, y: y + 0.31 * h))
    p.addLine(to: CGPoint(x: x + 0.78 * w, y: y + 0.70 * h))
    return p
}

// ---------- App icon ----------
do {
    let S = 1024
    let ctx = makeContext(S)
    let full = CGRect(x: 0, y: 0, width: S, height: S)
    ctx.clear(full)

    // Big Sur icon grid: 824pt square centred, radius ≈ 22.5%
    let side: CGFloat = 824
    let inset = (CGFloat(S) - side) / 2
    let sq = CGRect(x: inset, y: inset, width: side, height: side)
    let radius = side * 0.225

    // Soft drop shadow
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -14), blur: 40,
                  color: CGColor(gray: 0, alpha: 0.35))
    ctx.addPath(CGPath(roundedRect: sq, cornerWidth: radius, cornerHeight: radius, transform: nil))
    ctx.setFillColor(CGColor(gray: 0.12, alpha: 1))
    ctx.fillPath()
    ctx.restoreGState()

    // Gradient body (dark neutral, subtle top-light)
    ctx.saveGState()
    ctx.addPath(CGPath(roundedRect: sq, cornerWidth: radius, cornerHeight: radius, transform: nil))
    ctx.clip()
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    let colors = [CGColor(srgbRed: 0.24, green: 0.24, blue: 0.26, alpha: 1),
                  CGColor(srgbRed: 0.09, green: 0.09, blue: 0.10, alpha: 1)] as CFArray
    let grad = CGGradient(colorsSpace: cs, colors: colors, locations: [0, 1])!
    ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: sq.maxY), end: CGPoint(x: 0, y: sq.minY), options: [])
    // faint inner highlight at top edge
    ctx.setStrokeColor(CGColor(gray: 1, alpha: 0.10))
    ctx.setLineWidth(6)
    ctx.addPath(CGPath(roundedRect: sq.insetBy(dx: 3, dy: 3), cornerWidth: radius - 3, cornerHeight: radius - 3, transform: nil))
    ctx.strokePath()
    ctx.restoreGState()

    // Checkmark
    ctx.saveGState()
    ctx.setStrokeColor(CGColor(gray: 1, alpha: 1))
    ctx.setLineWidth(side * 0.11)
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    ctx.setShadow(offset: CGSize(width: 0, height: -6), blur: 14, color: CGColor(gray: 0, alpha: 0.35))
    ctx.addPath(checkPath(in: sq.insetBy(dx: side * 0.02, dy: side * 0.02)))
    ctx.strokePath()
    ctx.restoreGState()

    writePNG(ctx, "\(outDir)/app-icon.png")
}

// ---------- Menu bar (template) icon: rounded square outline + check ----------
do {
    let S = 44 // 22pt @2x
    let ctx = makeContext(S)
    ctx.clear(CGRect(x: 0, y: 0, width: S, height: S))
    let f = CGFloat(S)
    let box = CGRect(x: 4, y: 4, width: f - 8, height: f - 8)
    ctx.setStrokeColor(CGColor(gray: 0, alpha: 1))
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    // outline
    ctx.setLineWidth(3.2)
    ctx.addPath(CGPath(roundedRect: box, cornerWidth: 9, cornerHeight: 9, transform: nil))
    ctx.strokePath()
    // check
    ctx.setLineWidth(3.6)
    ctx.addPath(checkPath(in: box.insetBy(dx: 1, dy: 1)))
    ctx.strokePath()
    writePNG(ctx, "\(outDir)/tray.png")
}
