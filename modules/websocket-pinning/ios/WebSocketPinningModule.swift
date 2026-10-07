import ExpoModulesCore
import CryptoKit
import Foundation

public class WebSocketPinningModule: Module {
  private var webSocketTask: URLSessionWebSocketTask?
  private var urlSession: URLSession?
  private var postTasks = Set<URLSessionDataTask>()
  private let postLock = NSLock()
  private var expectedFingerprint: String?

  public func definition() -> ModuleDefinition {
    Name("WebSocketPinning")

    Events("onOpen", "onMessage", "onClose", "onError")

    AsyncFunction("connect") { (urlString: String, fingerprint: String) in
      self.expectedFingerprint = fingerprint
      guard let url = URL(string: urlString) else {
        self.sendEvent("onError", ["message": "Invalid URL"])
        return
      }

      let configuration = URLSessionConfiguration.default
      let delegate = WebSocketSessionDelegate(module: self, expectedFingerprint: fingerprint)
      self.urlSession = URLSession(configuration: configuration, delegate: delegate, delegateQueue: OperationQueue.main)
      
      self.webSocketTask = self.urlSession?.webSocketTask(with: url)
      self.webSocketTask?.resume()
      self.receiveMessage()
    }

    AsyncFunction("post") { (urlString: String, bodyString: String, fingerprint: String, promise: Promise) in
      guard let url = URL(string: urlString) else {
        promise.reject(NSError(domain: "WebSocketPinning", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"]))
        return
      }
      
      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = bodyString.data(using: .utf8)
      request.timeoutInterval = 130

      let configuration = URLSessionConfiguration.default
      configuration.timeoutIntervalForRequest = 130
      let delegate = WebSocketSessionDelegate(module: self, expectedFingerprint: fingerprint)
      let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: OperationQueue.main)
      
      var task: URLSessionDataTask?
      task = session.dataTask(with: request) { data, response, error in
        if let task = task { self.postLock.withLock { _ = self.postTasks.remove(task) } }
        if let error = error {
          promise.reject(error)
          return
        }
        guard let data = data, let responseString = String(data: data, encoding: .utf8) else {
          promise.reject(NSError(domain: "WebSocketPinning", code: -1, userInfo: [NSLocalizedDescriptionKey: "No data received"]))
          return
        }
        
        if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
          promise.reject(NSError(domain: "WebSocketPinning", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "HTTP error code: \(httpResponse.statusCode)", "body": responseString]))
          return
        }
        
        promise.resolve(responseString)
      }
      if let task = task {
        self.postLock.withLock { _ = self.postTasks.insert(task) }
        task.resume()
      }
    }

    Function("cancelPosts") {
      let tasks = self.postLock.withLock { () -> Set<URLSessionDataTask> in
        let pending = self.postTasks
        self.postTasks.removeAll()
        return pending
      }
      tasks.forEach { $0.cancel() }
    }

    Function("send") { (message: String) in
      let messageObj = URLSessionWebSocketTask.Message.string(message)
      self.webSocketTask?.send(messageObj) { error in
        if let error = error {
          self.sendEvent("onError", ["message": error.localizedDescription])
        }
      }
    }

    Function("sendBinary") { (base64String: String) in
      guard let data = Data(base64Encoded: base64String) else { return }
      let messageObj = URLSessionWebSocketTask.Message.data(data)
      self.webSocketTask?.send(messageObj) { error in
        if let error = error {
          self.sendEvent("onError", ["message": error.localizedDescription])
        }
      }
    }

    Function("close") {
      self.webSocketTask?.cancel(with: .normalClosure, reason: nil)
    }
  }

  private func receiveMessage() {
    webSocketTask?.receive { [weak self] result in
      guard let self = self else { return }
      switch result {
      case .success(let message):
        switch message {
        case .string(let text):
          self.sendEvent("onMessage", ["type": "text", "data": text])
        case .data(let data):
          self.sendEvent("onMessage", ["type": "binary", "data": data.base64EncodedString()])
        @unknown default:
          break
        }
        self.receiveMessage()
      case .failure(let error):
        if self.webSocketTask?.state != .completed {
          self.sendEvent("onError", ["message": error.localizedDescription])
          self.sendEvent("onClose", ["code": 1006, "reason": error.localizedDescription])
        }
      }
    }
  }
}

class WebSocketSessionDelegate: NSObject, URLSessionWebSocketDelegate {
  private weak var module: WebSocketPinningModule?
  private let expectedFingerprint: String

  init(module: WebSocketPinningModule, expectedFingerprint: String) {
    self.module = module
    self.expectedFingerprint = expectedFingerprint
  }

  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocolName: String?) {
    module?.sendEvent("onOpen", [:])
  }

  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
    let reasonStr = reason.flatMap { String(data: $0, encoding: .utf8) } ?? ""
    module?.sendEvent("onClose", ["code": closeCode.rawValue, "reason": reasonStr])
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
          let serverTrust = challenge.protectionSpace.serverTrust else {
      completionHandler(.performDefaultHandling, nil)
      return
    }

    if validate(serverTrust: serverTrust, expectedFingerprint: expectedFingerprint) {
      completionHandler(.useCredential, URLCredential(trust: serverTrust))
    } else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      module?.sendEvent("onError", ["message": "SSL Certificate Fingerprint Mismatch"])
    }
  }

  private func validate(serverTrust: SecTrust, expectedFingerprint: String) -> Bool {
    guard let certificate = SecTrustGetCertificateAtIndex(serverTrust, 0) else { return false }
    let data = SecCertificateCopyData(certificate) as Data
    let digest = SHA256.hash(data: data)
    let base64Fingerprint = "sha256/" + Data(digest).base64EncodedString()
    return base64Fingerprint == expectedFingerprint
  }
}
