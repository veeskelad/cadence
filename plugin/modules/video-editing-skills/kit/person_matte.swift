// Маска человека встроенной сегментацией macOS (Vision): кадры BGRA приходят в stdin, маски по одному байту на пиксель уходят в stdout.
//   person_matte <width> <height> [accurate|balanced|fast]
// Каждый кадр — ровно width*height*4 байт; на каждый кадр в ответ ровно width*height байт (255 — человек).
// Последовательный обработчик держит маску стабильной от кадра к кадру. Модель встроена в систему, сеть не нужна.
import CoreImage
import CoreVideo
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count >= 3, let w = Int(args[1]), let h = Int(args[2]), w > 0, h > 0 else {
  FileHandle.standardError.write("person_matte <width> <height> [accurate|balanced|fast]\n".data(using: .utf8)!)
  exit(2)
}
let quality: VNGeneratePersonSegmentationRequest.QualityLevel =
  args.count > 3 && args[3] == "fast" ? .fast : args.count > 3 && args[3] == "accurate" ? .accurate : .balanced

let frameBytes = w * h * 4
let input = FileHandle.standardInput
let output = FileHandle.standardOutput
let ctx = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull()])
let handler = VNSequenceRequestHandler()
var mask = [UInt8](repeating: 0, count: w * h)

func readExactly(_ n: Int) -> Data? {
  var data = Data(capacity: n)
  while data.count < n {
    guard let chunk = try? input.read(upToCount: n - data.count), !chunk.isEmpty else { return nil }
    data.append(chunk)
  }
  return data
}

while let frame = readExactly(frameBytes) {
  var pb: CVPixelBuffer?
  CVPixelBufferCreate(kCFAllocatorDefault, w, h, kCVPixelFormatType_32BGRA, nil, &pb)
  guard let buf = pb else { exit(1) }
  CVPixelBufferLockBaseAddress(buf, [])
  let dst = CVPixelBufferGetBaseAddress(buf)!.assumingMemoryBound(to: UInt8.self)
  let stride = CVPixelBufferGetBytesPerRow(buf)
  frame.withUnsafeBytes { (src: UnsafeRawBufferPointer) in
    for y in 0..<h { memcpy(dst + y * stride, src.baseAddress! + y * w * 4, w * 4) }
  }
  CVPixelBufferUnlockBaseAddress(buf, [])

  let req = VNGeneratePersonSegmentationRequest()
  req.qualityLevel = quality
  req.outputPixelFormat = kCVPixelFormatType_OneComponent8
  do { try handler.perform([req], on: buf) } catch { exit(1) }

  if let result = req.results?.first?.pixelBuffer {
    let small = CIImage(cvPixelBuffer: result)
    let scaled = small.transformed(by: CGAffineTransform(scaleX: CGFloat(w) / small.extent.width, y: CGFloat(h) / small.extent.height))
    mask.withUnsafeMutableBytes { (m: UnsafeMutableRawBufferPointer) in
      ctx.render(scaled, toBitmap: m.baseAddress!, rowBytes: w, bounds: CGRect(x: 0, y: 0, width: w, height: h), format: .L8, colorSpace: nil)
    }
  } else {
    for i in 0..<mask.count { mask[i] = 0 }
  }
  output.write(Data(mask))
}
