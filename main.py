import http.server
import socketserver
import os
import webbrowser
import threading
import time
from datetime import datetime

PORT = 8000
SAVE_DIR = "saved_abc"          # 文件保存目录
os.makedirs(SAVE_DIR, exist_ok=True)   # 自动创建目录

class SaveHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/save':
            # 读取请求体长度
            content_length = int(self.headers.get('Content-Length', 0))
            # 读取原始 POST 数据（即 ABC 文本）
            post_data = self.rfile.read(content_length).decode('utf-8')
            if post_data.strip():
                # 生成带时间戳的文件名
                timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                filename = f"abc_{timestamp}.txt"
                filepath = os.path.join(SAVE_DIR, filename)
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(post_data)
                # 返回成功响应
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(b"OK")
            else:
                self.send_error(400, "Empty content")
        else:
            self.send_error(404)

def open_browser():
    """等待服务器启动后打开浏览器"""
    time.sleep(1)  # 给服务器一点启动时间
    webbrowser.open(f'http://localhost:{PORT}')

if __name__ == '__main__':
    # 启动后台线程打开浏览器（守护线程，主线程退出时会自动结束）
    threading.Thread(target=open_browser, daemon=True).start()
    
    # 启动服务器（阻塞主线程）
    with socketserver.TCPServer(("", PORT), SaveHandler) as httpd:
        httpd.serve_forever()