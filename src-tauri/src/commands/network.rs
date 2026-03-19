use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct NetworkInterface {
    pub name: String,
    pub received_bytes: u64,
    pub transmitted_bytes: u64,
    pub received_speed_bps: u64,
    pub transmitted_speed_bps: u64,
}

#[derive(Serialize)]
pub struct NetworkStatus {
    pub interfaces: Vec<NetworkInterface>,
    pub total_received_speed_bps: u64,
    pub total_transmitted_speed_bps: u64,
}

#[tauri::command]
pub async fn get_network_status() -> Result<NetworkStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        use sysinfo::Networks;
        let networks = Networks::new_with_refreshed_list();

        let mut interfaces: Vec<NetworkInterface> = Vec::new();
        let mut total_rx: u64 = 0;
        let mut total_tx: u64 = 0;

        for (name, data) in &networks {
            let rx = data.received();
            let tx = data.transmitted();
            total_rx += rx;
            total_tx += tx;

            // 가상 어댑터 등 0바이트 인터페이스 스킵
            if rx == 0 && tx == 0 {
                continue;
            }

            interfaces.push(NetworkInterface {
                name: name.clone(),
                received_bytes: data.total_received(),
                transmitted_bytes: data.total_transmitted(),
                received_speed_bps: rx,
                transmitted_speed_bps: tx,
            });
        }

        // 속도 내림차순
        interfaces.sort_by(|a, b| (b.received_speed_bps + b.transmitted_speed_bps)
            .cmp(&(a.received_speed_bps + a.transmitted_speed_bps)));

        Ok(NetworkStatus {
            interfaces,
            total_received_speed_bps: total_rx,
            total_transmitted_speed_bps: total_tx,
        })
    })
    .await
    .map_err(|e| format!("네트워크 정보 조회 실패: {}", e))?
}
