use std::process::Command;

#[tauri::command]
pub fn execute_shutdown(action: String) -> Result<String, String> {
    let args: Vec<&str> = match action.as_str() {
        "shutdown" => vec!["/s", "/t", "0"],
        "restart" => vec!["/r", "/t", "0"],
        "logoff" => vec!["/l"],
        "cancel" => vec!["/a"],
        _ => return Err(format!("알 수 없는 동작: {}", action)),
    };

    Command::new("shutdown")
        .args(&args)
        .spawn()
        .map_err(|e| format!("명령 실행 실패: {}", e))?;

    let label = match action.as_str() {
        "shutdown" => "시스템 종료",
        "restart" => "재시작",
        "logoff" => "로그오프",
        "cancel" => "예약 취소",
        _ => &action,
    };
    Ok(format!("{} 명령 실행됨", label))
}
