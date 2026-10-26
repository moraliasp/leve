// Rasteriza design/icon.svg em PNG RGBA com fundo transparente (o qlmanage pinta branco).
// Uso: swift scripts/rasterize-icon.swift design/icon.svg design/icon-1024.png 1024
//      swift scripts/rasterize-icon.swift design/social-preview.svg design/social-preview.png 1280 640
import AppKit

let args = CommandLine.arguments
guard args.count >= 4, let size = Int(args[3]) else {
    FileHandle.standardError.write("uso: rasterize-icon.swift <in.svg> <out.png> <largura> [altura]\n".data(using: .utf8)!)
    exit(2)
}
let height = args.count >= 5 ? (Int(args[4]) ?? size) : size
guard let img = NSImage(contentsOf: URL(fileURLWithPath: args[1])) else {
    FileHandle.standardError.write("não consegui ler o SVG\n".data(using: .utf8)!)
    exit(1)
}
guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)
else { exit(1) }
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSGraphicsContext.current?.imageInterpolation = .high
NSColor.clear.set()
NSRect(x: 0, y: 0, width: size, height: height).fill()
img.draw(in: NSRect(x: 0, y: 0, width: size, height: height), from: .zero, operation: .sourceOver, fraction: 1)
NSGraphicsContext.restoreGraphicsState()
guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
try! png.write(to: URL(fileURLWithPath: args[2]))
print("ok \(size)x\(height) -> \(args[2])")
