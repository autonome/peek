#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

// Returns 1 if dark mode, 0 if light mode
// Gets effective appearance from the key window (handles auto mode correctly)
int get_system_is_dark_mode() {
    if (@available(iOS 13.0, *)) {
        __block int result = 0;
        if ([NSThread isMainThread]) {
            UIWindowScene *windowScene = nil;
            for (UIScene *scene in [UIApplication sharedApplication].connectedScenes) {
                if ([scene isKindOfClass:[UIWindowScene class]]) {
                    windowScene = (UIWindowScene *)scene;
                    break;
                }
            }
            if (windowScene) {
                UIWindow *window = windowScene.windows.firstObject;
                if (window) {
                    result = window.traitCollection.userInterfaceStyle == UIUserInterfaceStyleDark ? 1 : 0;
                }
            }
        } else {
            dispatch_sync(dispatch_get_main_queue(), ^{
                UIWindowScene *windowScene = nil;
                for (UIScene *scene in [UIApplication sharedApplication].connectedScenes) {
                    if ([scene isKindOfClass:[UIWindowScene class]]) {
                        windowScene = (UIWindowScene *)scene;
                        break;
                    }
                }
                if (windowScene) {
                    UIWindow *window = windowScene.windows.firstObject;
                    if (window) {
                        result = window.traitCollection.userInterfaceStyle == UIUserInterfaceStyleDark ? 1 : 0;
                    }
                }
            });
        }
        return result;
    }
    return 0;
}

// Returns 1 if this is an App Store or TestFlight build, 0 if Xcode install
// App Store/TestFlight builds have a receipt file, Xcode installs don't
int is_app_store_build() {
    NSURL *receiptURL = [[NSBundle mainBundle] appStoreReceiptURL];
    if (receiptURL == nil) {
        NSLog(@"[AppGroupBridge] No receipt URL - Xcode build");
        return 0;
    }

    BOOL exists = [[NSFileManager defaultManager] fileExistsAtPath:receiptURL.path];
    NSLog(@"[AppGroupBridge] Receipt exists: %d at %@", exists, receiptURL.path);
    return exists ? 1 : 0;
}

// Returns the path to the App Group container directory
// This is where the SQLite database will be stored
const char* get_app_group_container_path() {
    NSURL *containerURL = [[NSFileManager defaultManager]
        containerURLForSecurityApplicationGroupIdentifier:@"group.com.dietrich.peek-mobile"];

    if (containerURL == nil) {
        NSLog(@"[AppGroupBridge] Failed to get App Group container URL");
        return NULL;
    }

    NSLog(@"[AppGroupBridge] Container path: %@", containerURL.path);
    return strdup([containerURL.path UTF8String]);
}
