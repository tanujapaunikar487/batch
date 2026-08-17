// Renders the DMG window background: plain black, a thin arrow with a label
// between the app icon (left) and the Applications folder (right).
// Window is 660×400 pt; we render 1x and 2x and combine into a Retina TIFF.
import AppKit

let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."
let W: CGFloat = 660, H: CGFloat = 400

func render(scale: CGFloat) -> CGImage {
    let w = Int(W * scale), h = Int(H * scale)
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.scaleBy(x: scale, y: scale)
    // Plain black
    ctx.setFillColor(CGColor(gray: 0, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))

    // Hand-drawn arrow from the app icon (left, ~x=165) to Applications (right, ~x=495),
    // arcing above the icons; slightly wobbly, double-stroked like a marker.
    let grey = CGColor(gray: 0.72, alpha: 1)
    ctx.setStrokeColor(grey); ctx.setLineCap(.round); ctx.setLineJoin(.round)
    let start = CGPoint(x: 232, y: 244), end = CGPoint(x: 428, y: 246)
    let c1 = CGPoint(x: 290, y: 305), c2 = CGPoint(x: 380, y: 305)
    func wobble(_ p: CGPoint, _ dx: CGFloat, _ dy: CGFloat) -> CGPoint { CGPoint(x: p.x + dx, y: p.y + dy) }
    for (i, w) in [CGFloat(2.6), 1.4].enumerated() {
        ctx.setLineWidth(w)
        let j: CGFloat = i == 0 ? 0 : 1.2
        ctx.move(to: wobble(start, 0, j))
        ctx.addCurve(to: wobble(end, -2, j), control1: wobble(c1, -3, -j), control2: wobble(c2, 4, j))
        ctx.strokePath()
    }
    // Arrow head: two loose strokes
    ctx.setLineWidth(2.6)
    ctx.move(to: CGPoint(x: 410, y: 262)); ctx.addLine(to: end); ctx.strokePath()
    ctx.move(to: CGPoint(x: 405, y: 236)); ctx.addLine(to: CGPoint(x: end.x + 1, y: end.y - 1)); ctx.strokePath()

    // Label under the arc
    let label = "DRAG TO INSTALL" as NSString
    let font = NSFont.monospacedSystemFont(ofSize: 12, weight: .medium)
    let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor(cgColor: grey)!, .kern: 1.6]
    let size = label.size(withAttributes: attrs)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
    label.draw(at: CGPoint(x: W / 2 - size.width / 2, y: 118 - size.height / 2), withAttributes: attrs)
    NSGraphicsContext.restoreGraphicsState()
    return ctx.makeImage()!
}

func write(_ img: CGImage, _ path: String) {
    let rep = NSBitmapImageRep(cgImage: img)
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}
write(render(scale: 1), "\(outDir)/dmg-bg.png")
write(render(scale: 2), "\(outDir)/dmg-bg@2x.png")
print("wrote dmg backgrounds")
