use std::sync::RwLock;
use tauri::{AppHandle, Emitter};
use tauri_plugin_log::log;
use tauri::State;
/// 无字段枚举变体，serde 默认以 JSON 字符串表示（Offline/Online/Exception），
/// 前端 invoke 时直接传字符串即可，无需数字标号。
#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
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
    fn set_state(&self, state: ChatState){
        *self.state.write().unwrap() = state;
        let text = self.state.read().unwrap().status_text();
        if let Err(e) = self.app.emit("chat_status", text) {
            log::error!("事件推送失败: {e}");
        }
    }
}


// 探针:参数位省略生命周期标注,State<ChatCore> 不带 '_ — 能否通过宏展开与编译?
// rename 给出模块前缀限定名:前端 invoke('chat_set_state', { state: 'Online' })
#[tauri::command(rename = "client.set_state")]
pub fn set_state(core: State<ChatCore>, state: ChatState) {
    core.set_state(state);
}