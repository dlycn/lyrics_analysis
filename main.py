import http.server
import webbrowser
import threading
import time

# 启动HTTP服务器
def start_server():
    server = http.server.HTTPServer(('localhost', 8000), http.server.SimpleHTTPRequestHandler)
    server.serve_forever()

# 打开浏览器
def open_browser():
    # 等待服务器启动
    time.sleep(0.5)
    webbrowser.open('http://localhost:8000')

# 在后台启动服务器
server_thread = threading.Thread(target=start_server)
server_thread.daemon = True
server_thread.start()

# 打开浏览器
open_browser()

# 主线程保持运行
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("Server stopped.")