import ExpoModulesCore
import ImageIO
import Vision

/// Recognises text on a receipt photo and returns every line with its position, so the app can
/// rebuild rows (name on the left, price on the right) instead of guessing from a flat list.
public class ReceiptVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReceiptVision")
    Constants(["isSupported": true])

    AsyncFunction("recognize") { (url: URL, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
          promise.reject("ERR_RECEIPT_IMAGE", "The receipt image could not be read.")
          return
        }
        // Camera photos are stored sideways with an orientation tag; Vision needs it to read upright text.
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        let raw = (properties?[kCGImagePropertyOrientation] as? UInt32) ?? 1
        let orientation = CGImagePropertyOrientation(rawValue: raw) ?? .up

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        // Correction would "fix" receipt abbreviations and codes into the wrong words.
        request.usesLanguageCorrection = false
        let supported = (try? request.supportedRecognitionLanguages()) ?? []
        // Arabic first: with English first, Vision reads Arabic script as Latin letters. English still reads correctly.
        let wanted = ["ar-SA", "en-US"].filter { supported.contains($0) }
        if !wanted.isEmpty { request.recognitionLanguages = wanted }
        request.automaticallyDetectsLanguage = true

        do {
          try VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:]).perform([request])
        } catch {
          promise.reject("ERR_RECEIPT_VISION", error.localizedDescription)
          return
        }
        // Vision's origin is bottom-left; flip to top-left so rows sort top to bottom.
        let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
          guard let candidate = observation.topCandidates(1).first else { return nil }
          return [
            "text": candidate.string,
            "confidence": Double(candidate.confidence),
            "x": Double(observation.boundingBox.minX),
            "y": Double(1 - observation.boundingBox.maxY),
            "width": Double(observation.boundingBox.width),
            "height": Double(observation.boundingBox.height),
            "angle": Double(atan2(observation.topRight.y - observation.topLeft.y, observation.topRight.x - observation.topLeft.x)),
          ]
        }
        // Size of the upright image, so positions can be compared in the same units across and down.
        let sideways = raw >= 5 && raw <= 8
        promise.resolve([
          "lines": lines, "languages": wanted,
          "width": sideways ? image.height : image.width, "height": sideways ? image.width : image.height,
        ])
      }
    }
  }
}
