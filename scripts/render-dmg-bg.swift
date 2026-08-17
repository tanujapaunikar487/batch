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

    // Arrow: line — label — line ▶  centred at y = 200 (icons sit at y ≈ 200 too)
    let y: CGFloat = 200
    let grey = CGColor(gray: 0.62, alpha: 1)
    let label = "DRAG TO INSTALL" as NSString
    let font = NSFont.monospacedSystemFont(ofSize: 12, weight: .medium)
    let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor(cgColor: grey)!, .kern: 1.6]
    let size = label.size(withAttributes: attrs)
    let cx: CGFloat = W / 2
    let gap: CGFloat = 14
    let lineLen: CGFloat = 60
    ctx.setStrokeColor(grey); ctx.setLineWidth(1.5); ctx.setLineCap(.round)
    // left line
    ctx.move(to: CGPoint(x: cx - size.width/2 - gap - lineLen, y: y)); ctx.addLine(to: CGPoint(x: cx - size.width/2 - gap, y: y)); ctx.strokePath()
    // right line + arrow head
    let rx0 = cx + size.width/2 + gap, rx1 = rx0 + lineLen
    ctx.move(to: CGPoint(x: rx0, y: y)); ctx.addLine(to: CGPoint(x: rx1, y: y)); ctx.strokePath()
    ctx.move(to: CGPoint(x: rx1 - 8, y: y + 6)); ctx.addLine(to: CGPoint(x: rx1, y: y)); ctx.addLine(to: CGPoint(x: rx1 - 8, y: y - 6)); ctx.strokePath()
    // label
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
    label.draw(at: CGPoint(x: cx - size.width/2, y: y - size.height/2 + 1), withAttributes: attrs)
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
