// 探针:State<'r, T> 的 '_' 到底能不能省
struct State<'r, T>(&'r T);

// ① 显式写 '_'
fn with_underscore(core: State<'_, u32>) {
    let _ = core.0;
}

// ② 完全省略 —— 能编译吗?
fn without_lifetime(core: State<u32>) {
    let _ = core.0;
}

fn main() {
    let x = 42;
    with_underscore(State(&x));
    without_lifetime(State(&x));
}