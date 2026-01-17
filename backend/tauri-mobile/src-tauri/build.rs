fn main() {
    // Compile Objective-C bridge for iOS
    let target = std::env::var("TARGET").unwrap();
    if target.contains("ios") {
        cc::Build::new()
            .file("AppGroupBridge.m")
            .compile("app_group_bridge");

        println!("cargo:rustc-link-lib=framework=Foundation");
    }

    tauri_build::build()
}
