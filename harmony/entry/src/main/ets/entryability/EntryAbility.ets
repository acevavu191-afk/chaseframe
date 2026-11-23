import UIAbility from '@ohos.app.ability.UIAbility';
import window from '@ohos.window';
import Want from '@ohos.app.ability.Want';
import AbilityConstant from '@ohos.app.ability.AbilityConstant';
import hilog from '@ohos.hilog';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(0x0000, 'ChaseFrame', 'onCreate');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    // 全屏 + 深色状态栏，和网页取景器保持一致的沉浸感
    windowStage.getMainWindow().then((win: window.Window) => {
      win.setWindowLayoutFullScreen(true).catch(() => {});
      win.setWindowSystemBarProperties({
        statusBarColor: '#08080A',
        navigationBarColor: '#08080A',
        statusBarContentColor: '#FFFFFF',
        navigationBarContentColor: '#FFFFFF'
      }).catch(() => {});
    }).catch(() => {});

    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(0x0000, 'ChaseFrame', 'loadContent failed: %{public}s', JSON.stringify(err));
      }
    });
  }
}
