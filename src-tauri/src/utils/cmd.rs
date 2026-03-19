use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Windows에서 콘솔 창이 뜨지 않도록 CREATE_NO_WINDOW 플래그를 설정한 Command 생성
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// PowerShell 명령을 콘솔 창 없이 실행하는 헬퍼
pub fn powershell_no_window() -> Command {
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive"]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// 임의의 프로그램을 콘솔 창 없이 실행하는 헬퍼
pub fn command_no_window(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}
