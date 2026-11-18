use std::sync::RwLock;
use tauri::{AppHandle, Emitter};
use tauri_plugin_log::log;

pub enum ChatState{
    Offline,
    Online,
    Exception,
}

impl ChatState {
    /// 每个状态对应的前端展示文案(#chat-hd-status 会显示它)
    fn status_text(&self) -> &'static str {
        match self {
            ChatState::Offline => "离线",
            ChatState::Online => "在线",
            ChatState::Exception => "异常",
        }
    }
}

pub struct ChatCore{
    state: RwLock<ChatState>,
    logger: String,
    app: AppHandle,
}
impl ChatCore{ 
    pub fn mount(app: AppHandle) -> Self{
        Self{
            state: RwLock::new(ChatState::Offline),
            logger: String::new(),
            app,
        }
    }

    /// 修改状态并立即把新状态广播给前端(所有监听 chat_status 的窗口都会收到)
    pub fn set_state(&self, state: ChatState){
        *self.state.write().unwrap() = state;
        self.flush_status();
    }

    /// 把当前 ChatState 以事件形式推给前端:前端 listen('chat_status') 即可收到
    fn flush_status(&self){
        let text = self.state.read().unwrap().status_text();
        if let Err(e) = self.app.emit("chat_status", text) {
            log::error!("chat_status 事件推送失败: {e}");
        }
    }
}