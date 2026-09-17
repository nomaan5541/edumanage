//! Native window shell for the existing EduManage Vite/React app.
//!
//! Authorization, validation, and data access stay in Supabase (RLS, RPCs,
//! Edge Functions) and in `src/`. Do not add a second client, permission
//! checks, or school-scoped queries here.

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running EduManage");
}
