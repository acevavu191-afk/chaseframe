import web_webview from '@ohos.web.webview';
import abilityAccessCtrl, { Permissions } from '@ohos.abilityAccessCtrl';
import common from '@ohos.app.ability.common';

/**
 * 追帧 ChaseFrame — 鸿蒙外壳
 *
 * 关键点：
 * 1. 用 $rawfile('www/index.html') 加载本地页面，file:// 属于可信来源，getUserMedia 可用；
 * 2. onPermissionRequest 必须把 CAMERA 授予 Web 内核，否则取景是黑屏；
 * 3. 系统权限（ohos.permission.CAMERA）由应用先申请，Web 层的授权才有意义。
 */
@Entry
@Component
struct Index {
  controller: web_webview.WebviewController = new web_webview.WebviewController();
  private permissions: Array<Permissions> = ['ohos.permission.CAMERA', 'ohos.permission.MICROPHONE'];

  aboutToAppear(): void {
    const ctx = getContext(this) as common.UIAbilityContext;
    abilityAccessCtrl.createAtManager()
      .requestPermissionsFromUser(ctx, this.permissions)
      .catch(() => {});
  }

  build() {
    Column() {
      Web({ src: $rawfile('www/index.html'), controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(true)
        .imageAccess(true)
        .mixedMode(MixedMode.All)
        .zoomAccess(false)
        .horizontalScrollBarAccess(false)
        .verticalScrollBarAccess(false)
        .onPermissionRequest((event) => {
          if (event) {
            event.request.grant(event.request.getAccessibleResource());
          }
        })
        .onConsole((event) => {
          console.info('[ChaseFrame] ' + event.message.getMessage());
          return false;
        })
        .width('100%')
        .height('100%')
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#08080A')
  }
}
