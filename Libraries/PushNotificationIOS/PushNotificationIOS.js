/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

const NativeEventEmitter = require('NativeEventEmitter');
const RCTPushNotificationManager = require('NativeModules')
  .PushNotificationManager;
const invariant = require('fbjs/lib/invariant');

const PushNotificationEmitter = new NativeEventEmitter(
  RCTPushNotificationManager,
);

const _notifHandlers = new Map();

const DEVICE_NOTIF_EVENT = 'remoteNotificationReceived';
const NOTIF_REGISTER_EVENT = 'remoteNotificationsRegistered';
const NOTIF_REGISTRATION_ERROR_EVENT = 'remoteNotificationRegistrationError';
const NOTIF_RESPONSE_EVENT = 'notificationResponseReceived';
const DEVICE_LOCAL_NOTIF_EVENT = 'localNotificationReceived';
const DEVICE_WILLSHOW_NOTIF_EVENT = 'willPresentNotification';

export type ContentAvailable = 1 | null | void;

export type FetchResult = {
  NewData: string,
  NoData: string,
  ResultFailed: string,
};

/**
 * An event emitted by PushNotificationIOS.
 */
export type PushNotificationEventName = $Enum<{
  /**
   * Fired when a remote notification is received. The handler will be invoked
   * with an instance of `PushNotificationIOS`.
   */
  notification: string,
  /**
   * Fired when a local notification is received. The handler will be invoked
   * with an instance of `PushNotificationIOS`.
   */
  localNotification: string,
  /**
   * Fired when the user registers for remote notifications. The handler will be
   * invoked with a hex string representing the deviceToken.
   */
  register: string,
  /**
   * Fired when the user fails to register for remote notifications. Typically
   * occurs when APNS is having issues, or the device is a simulator. The
   * handler will be invoked with {message: string, code: number, details: any}.
   */
  registrationError: string,
  /**
   * Fired when the user responds to a notification by opening the application,
   * dismissing the notification or choosing a UNNotificationAction. The handler
   * will be invoked with {notification: `PushNotificationIOS`, action: string,
   * userText: [string]}. (Only available iOS >= 10)
   */
  response: string,
  /**
   * Fired when a local notification will be presented in the foreground. The handler
   * will be invoked with an instance of `PushNotificationIOS`. (Only available iOS >= 10)
   */
  willPresent: string
}>;

/**
 *
 * Handle push notifications for your app, including permission handling and
 * icon badge number.
 *
 * To get up and running, [configure your notifications with Apple](https://developer.apple.com/library/ios/documentation/IDEs/Conceptual/AppDistributionGuide/AddingCapabilities/AddingCapabilities.html#//apple_ref/doc/uid/TP40012582-CH26-SW6)
 * and your server-side system.
 *
 * [Manually link](docs/linking-libraries-ios.html#manual-linking) the PushNotificationIOS library
 *
 * - Add the following to your Project: `node_modules/react-native/Libraries/PushNotificationIOS/RCTPushNotification.xcodeproj`
 * - Add the following to `Link Binary With Libraries`: `libRCTPushNotification.a`
 *
 * Finally, to enable support for `notification` and `register` events you need to augment your AppDelegate.
 *
 * At the top of your `AppDelegate.h` change:
 *
 *   `@interface AppDelegate : UIResponder <UIApplicationDelegate>`
 *
 * to:
 *
 *   `@interface AppDelegate : UIResponder <UIApplicationDelegate, UNUserNotificationCenterDelegate>`
 *
 * At the top of your `AppDelegate.m`:
 *
 *   `#import <React/RCTPushNotificationManager.h>`
 *
 * At the top of your AppDelegate's `didFinishLaunchingWithOptions` add the following:
 *
 *   `[UNUserNotificationCenter currentNotificationCenter].delegate = self;`
 *
 * And then in your AppDelegate implementation add the following:
 *
 *   ```
 *    // Required to register for notifications
 *    - (void)application:(UIApplication *)application didRegisterUserNotificationSettings:(UIUserNotificationSettings *)notificationSettings
 *    {
 *     [RCTPushNotificationManager didRegisterUserNotificationSettings:notificationSettings];
 *    }
 *    // Required for the register event.
 *    - (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
 *    {
 *     [RCTPushNotificationManager didRegisterForRemoteNotificationsWithDeviceToken:deviceToken];
 *    }
 *    // Required for the notification event. You must call the completion handler after handling the remote notification.
 *    - (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo
 *                                                           fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler
 *    {
 *      [RCTPushNotificationManager didReceiveRemoteNotification:userInfo fetchCompletionHandler:completionHandler];
 *    }
 *    // Required for the registrationError event.
 *    - (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
 *    {
 *     [RCTPushNotificationManager didFailToRegisterForRemoteNotificationsWithError:error];
 *    }
 *    // Required for the localNotification event.
 *    - (void)application:(UIApplication *)application didReceiveLocalNotification:(UILocalNotification *)notification
 *    {
 *     [RCTPushNotificationManager didReceiveLocalNotification:notification];
 *    }
 *    // Required for presenting notifications when the app is in the foreground (willPresent event).
 *    - (void)userNotificationCenter:(UNUserNotificationCenter *)center willPresentNotification:(UNNotification *)notification withCompletionHandler:(void (^)(UNNotificationPresentationOptions options))completionHandler
 *    {
 *     [RCTPushNotificationManager willPresentNotification:notification showCompletionHandler:completionHandler];
 *    }
 *    // Required for handling notification responses (clicking actions or dismissing).
 *    - (void)userNotificationCenter:(UNUserNotificationCenter *)center didReceiveNotificationResponse:(UNNotificationResponse *)response withCompletionHandler:(void(^)())completionHandler
 *    {
 *     [RCTPushNotificationManager didReceiveNotificationResponse:response completionHandler:completionHandler];
 *    }
 *   ```
 */
class PushNotificationIOS {
  _data: Object;
  _alert: string | Object;
  _sound: string;
  _category: string;
  _contentAvailable: ContentAvailable;
  _badgeCount: number;
  _notificationId: string;
  _threadId: string;
  _trigger: Object;
  _isRemote: boolean;
  _remoteNotificationCompleteCallbackCalled: boolean;
  _showForegroundCompleteCallbackCalled: boolean;
  _responseCompleteCallbackCalled: boolean;

  static FetchResult: FetchResult = {
    NewData: 'UIBackgroundFetchResultNewData',
    NoData: 'UIBackgroundFetchResultNoData',
    ResultFailed: 'UIBackgroundFetchResultFailed',
  };

  static PresentationOption: PresentationOption = {
    Badge: 'UNNotificationPresentationOptionBadge',
    Sound: 'UNNotificationPresentationOptionSound',
    Alert: 'UNNotificationPresentationOptionAlert',
  };

  static ActionOption: ActionOption = {
    AuthenticationRequired: 'UNNotificationActionOptionAuthenticationRequired',
    Destructive: 'UNNotificationActionOptionDestructive',
    Foreground: 'UNNotificationActionOptionForeground'
  };

  static CategoryOption: CategoryOption = {
    CustomDismissAction: 'UNNotificationCategoryOptionCustomDismissAction',
    AllowInCarPlay: 'UNNotificationCategoryOptionAllowInCarPlay'
  };

  /**
   * Schedules the localNotification for immediate presentation.
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#presentlocalnotification
   */
  static presentLocalNotification(details: Object, callback: Function) {
    RCTPushNotificationManager.presentLocalNotification(details, callback || function(){});
  }

  /**
   * Schedules the localNotification for future presentation.
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#schedulelocalnotification
   */
  static scheduleLocalNotification(details: Object, callback: Function) {
    RCTPushNotificationManager.scheduleLocalNotification(details, callback || function(){});
  }

  /**
   * Cancels all scheduled localNotifications.
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#cancelalllocalnotifications
   */
  static cancelAllLocalNotifications() {
    RCTPushNotificationManager.cancelAllLocalNotifications();
  }

  /**
   * Remove all delivered notifications from Notification Center.
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#removealldeliverednotifications
   */
  static removeAllDeliveredNotifications(): void {
    RCTPushNotificationManager.removeAllDeliveredNotifications();
  }

  /**
   * Provides you with a list of the app’s notifications that are still displayed in Notification Center.
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#getdeliverednotifications
   */
  static getDeliveredNotifications(
    callback: (notifications: Array<Object>) => void,
  ): void {
    RCTPushNotificationManager.getDeliveredNotifications(callback);
  }

  /**
   * Removes the specified notifications from Notification Center
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#removedeliverednotifications
   */
  static removeDeliveredNotifications(identifiers: Array<string>): void {
    RCTPushNotificationManager.removeDeliveredNotifications(identifiers);
  }

  /**
   * Sets the badge number for the app icon on the home screen.
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#setapplicationiconbadgenumber
   */
  static setApplicationIconBadgeNumber(number: number) {
    RCTPushNotificationManager.setApplicationIconBadgeNumber(number);
  }

  /**
   * Gets the current badge number for the app icon on the home screen.
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#getapplicationiconbadgenumber
   */
  static getApplicationIconBadgeNumber(callback: Function) {
    RCTPushNotificationManager.getApplicationIconBadgeNumber(callback);
  }

  /**
   * Cancel local notifications.
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#cancellocalnotification
   */
  static cancelLocalNotifications(userInfo: Object) {
    RCTPushNotificationManager.cancelLocalNotifications(userInfo);
  }

  /**
   * Gets the local notifications that are currently scheduled.
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#getscheduledlocalnotifications
   */
  static getScheduledLocalNotifications(callback: Function) {
    RCTPushNotificationManager.getScheduledLocalNotifications(callback);
  }

  static setNotificationCategories(categories: [Object]) {
    RCTPushNotificationManager.setNotificationCategories(categories);
  }


  /**
   * Attaches a listener to remote or local notification events while the app
   * is running in the foreground or the background.
   *
   * - `notification` : Fired when a remote notification is received. The
   *   handler will be invoked with an instance of `PushNotificationIOS`.
   * - `localNotification` : Fired when a local notification is received. The
   *   handler will be invoked with an instance of `PushNotificationIOS`.
   * - `register`: Fired when the user registers for remote notifications. The
   *   handler will be invoked with a hex string representing the deviceToken.
   * - `registrationError`: Fired when the user fails to register for remote
   *   notifications. Typically occurs when APNS is having issues, or the device
   *   is a simulator. The handler will be invoked with
   *   {message: string, code: number, details: any}.
   * - `response`: Fired when the user responds to a notification, by opening the
   *   application, dismissing the notification or choosing a UNNotificationAction.
   *   The handler will be invoked with
   *   {notification: `PushNotificationIOS`, action: string, userText: [string]}
   * - `willPresent`: Fired if a notification is received in the foreground
   *   on a device running iOS 10 or greater. The handler will be invoked with
   *   an instance of `PushNotificationIOS`.
   */
  static addEventListener(type: PushNotificationEventName, handler: Function) {
    invariant(
      type === 'notification' || type === 'register' || type === 'registrationError' || type === 'localNotification' || type === 'willPresent' || type === 'response',
      'PushNotificationIOS only supports `notification`, `register`, `registrationError`, `willPresent`, `response`, and `localNotification` events'
    );
    let listener;
    if (type === 'notification') {
      listener = PushNotificationEmitter.addListener(
        DEVICE_NOTIF_EVENT,
        notifData => {
          handler(new PushNotificationIOS(notifData));
        },
      );
    } else if (type === 'localNotification') {
      listener = PushNotificationEmitter.addListener(
        DEVICE_LOCAL_NOTIF_EVENT,
        notifData => {
          handler(new PushNotificationIOS(notifData));
        },
      );
    } else if (type === 'register') {
      listener = PushNotificationEmitter.addListener(
        NOTIF_REGISTER_EVENT,
        registrationInfo => {
          handler(registrationInfo.deviceToken);
        },
      );
    } else if (type === 'registrationError') {
      listener = PushNotificationEmitter.addListener(
        NOTIF_REGISTRATION_ERROR_EVENT,
        errorInfo => {
          handler(errorInfo);
        },
      );
    } else if (type === 'response') {
      listener = PushNotificationEmitter.addListener(
        NOTIF_RESPONSE_EVENT,
        (notifData) => {
          handler({
            notification: new PushNotificationIOS(notifData.notification),
            action: notifData.action,
            userText: notifData.userText
          });
        }
      )
    } else if (type === 'willPresent') {
      listener = PushNotificationEmitter.addListener(
        DEVICE_WILLSHOW_NOTIF_EVENT,
        (notifData) => {
          handler(new PushNotificationIOS(notifData));
        }
      )
    }
    _notifHandlers.set(type, listener);
  }

  /**
   * Removes the event listener. Do this in `componentWillUnmount` to prevent
   * memory leaks.
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#removeeventlistener
   */
  static removeEventListener(
    type: PushNotificationEventName,
    handler: Function,
  ) {
    invariant(
      type === 'notification' || type === 'register' || type === 'registrationError' || type === 'localNotification' || type === 'willPresent' || type === 'response',
      'PushNotificationIOS only supports `notification`, `register`, `registrationError`, and `localNotification` events'
    );
    const listener = _notifHandlers.get(type);
    if (!listener) {
      return;
    }
    listener.remove();
    _notifHandlers.delete(type);
  }

  /**
   * Requests notification permissions from iOS, prompting the user's
   * dialog box. By default, it will request all notification permissions, but
   * a subset of these can be requested by passing a map of requested
   * permissions.
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#requestpermissions
   */
  static requestPermissions(permissions?: {
    alert?: boolean,
    badge?: boolean,
    sound?: boolean,
  }): Promise<{
    alert: boolean,
    badge: boolean,
    sound: boolean,
  }> {
    let requestedPermissions = {};
    if (permissions) {
      requestedPermissions = {
        alert: !!permissions.alert,
        badge: !!permissions.badge,
        sound: !!permissions.sound,
      };
    } else {
      requestedPermissions = {
        alert: true,
        badge: true,
        sound: true,
      };
    }
    return RCTPushNotificationManager.requestPermissions(requestedPermissions);
  }

  /**
   * Unregister for all remote notifications received via Apple Push Notification service.
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#abandonpermissions
   */
  static abandonPermissions() {
    RCTPushNotificationManager.abandonPermissions();
  }

  /**
   * See what push permissions are currently enabled. `callback` will be
   * invoked with a `permissions` object.
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#checkpermissions
   */
  static checkPermissions(callback: Function) {
    invariant(typeof callback === 'function', 'Must provide a valid callback');
    RCTPushNotificationManager.checkPermissions(callback);
  }

  /**
   * This method returns a promise that resolves to either the notification
   * object if the app was launched by a push notification, or `null` otherwise.
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#getinitialnotification
   */
  static getInitialNotification(): Promise<?PushNotificationIOS> {
    return RCTPushNotificationManager.getInitialNotification().then(
      notification => {
        return notification && new PushNotificationIOS(notification);
      },
    );
  }

  /**
   * You will never need to instantiate `PushNotificationIOS` yourself.
   * Listening to the `notification` event and invoking
   * `getInitialNotification` is sufficient
   *
   */
  constructor(nativeNotif: Object) {
    this._data = {};
    this._remoteNotificationCompleteCallbackCalled = false;
    this._showForegroundCompleteCallbackCalled = false;
    this._responseCompleteCallbackCalled = false;
    this._isRemote = nativeNotif.remote;
    if (this._isRemote) {
      this._notificationId = nativeNotif.notificationId;
    }

    if (nativeNotif.remote) {
      // Extract data from Apple's `aps` dict as defined:
      // https://developer.apple.com/library/ios/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/Chapters/ApplePushService.html
      Object.keys(nativeNotif).forEach(notifKey => {
        const notifVal = nativeNotif[notifKey];
        if (notifKey === 'aps') {
          this._alert = notifVal.alert;
          this._sound = notifVal.sound;
          this._badgeCount = notifVal.badge;
          this._title = notifVal.alertTitle;
          this._subtitle = notifVal.alertSubtitle;
          this._category = notifVal.category;
          this._contentAvailable = notifVal['content-available'];
          this._threadId = notifVal['thread-id'];
          this._trigger = notifVal.trigger;
          // Make sure we don't overwrite existing value
          this._notificationId = notifVal.notificationId || this.notificationId;
          this._data = {...this._data, ...notifVal.userInfo};
        } else {
          this._data[notifKey] = notifVal;
        }
      });
    } else {
      // Local notifications aren't being sent down with `aps` dict.
      this._badgeCount = nativeNotif.applicationIconBadgeNumber;
      this._sound = nativeNotif.soundName;
      this._alert = nativeNotif.alertBody;
      this._title = nativeNotif.alertTitle;
      this._subtitle = nativeNotif.alertSubtitle;
      this._data = nativeNotif.userInfo;
      this._category = nativeNotif.category;
      this._trigger = nativeNotif.trigger;
      this._threadId = nativeNotif.threadId;
      this._notificationId = nativeNotif.notificationId;
    }
  }

  /**
   * This method is available for remote notifications that have been responded
   * to via:
   * `userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler`
   * https://developer.apple.com/documentation/usernotifications/unusernotificationcenterdelegate/1649501-usernotificationcenter
   *
   * Call this to execute when the response handling is complete.
   */
  completeResponse() {
    if (!this._notificationId || this._responseCompleteCallbackCalled) {
      return;
    }
    this._responseCompleteCallbackCalled = true;

    RCTPushNotificationManager.onFinishNotificationResponse(this._notificationId);
  }

  /**
   * This method is available for remote notifications that have been received via:
   * `application:didReceiveRemoteNotification:fetchCompletionHandler:`
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#finish
   */
  finish(fetchResult: string) {
    if (
      !this._isRemote ||
      !this._notificationId ||
      this._remoteNotificationCompleteCallbackCalled
    ) {
      return;
    }
    this._remoteNotificationCompleteCallbackCalled = true;

    RCTPushNotificationManager.onFinishRemoteNotification(
      this._notificationId,
      fetchResult,
    );
  }

  /**
   * This method is available for remote notifications that have been received via:
   * `userNotificationCenter:willPresentNotification:withCompletionHandler:`
   * https://developer.apple.com/documentation/usernotifications/unusernotificationcenterdelegate/1649518-usernotificationcenter
   *
   * Call this to decide how to present a foreground notification once you have
   * handled it. When calling this block, pass in an array of strings determining
   * how the notification should be displayed. You *must* call this handler and should
   * do so as soon as possible. For a list of possible values, see `PushNotificationIOS.PresentationOptions`.
   *
   * If you do not call this method the notification will not be shown in the foreground.
   */
  presentForeground(presentationOptions: [PresentationOption]) {
    if (!this._notificationId || this._showForegroundCompleteCallbackCalled) {
      return;
    }
    this._showForegroundCompleteCallbackCalled = true;

    RCTPushNotificationManager.onPresentForegroundNotification(this._notificationId, presentationOptions)
  }

  /**
   * An alias for `getAlert` to get the notification's main message string
   */
  getMessage(): ?string | ?Object {
    // alias because "alert" is an ambiguous name
    return this._alert;
  }

  /**
   * Gets the sound string from the `aps` object
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#getsound
   */
  getSound(): ?string {
    return this._sound;
  }

  /**
   * Gets the category string from the `aps` object
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#getcategory
   */
  getCategory(): ?string {
    return this._category;
  }

  /**
   * Gets the notification's main message from the `aps` object
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#getalert
   */
  getAlert(): ?string | ?Object {
    return this._alert;
  }

  /**
   * Gets the content-available number from the `aps` object
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#getcontentavailable
   */
  getContentAvailable(): ContentAvailable {
    return this._contentAvailable;
  }

  /**
   * Gets the badge count number from the `aps` object
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#getbadgecount
   */
  getBadgeCount(): ?number {
    return this._badgeCount;
  }

  /**
   * Gets the data object on the notif
   *
   * See https://facebook.github.io/react-native/docs/pushnotificationios.html#getdata
   */
  getData(): ?Object {
    return this._data;
  }

  /**
   * Gets the thread id on the notif
   */
  getThreadId(): ?string {
    return this._threadId;
  }

  /**
   * Gets the trigger for the notification
   */
  getTrigger(): ?Object {
    return this._trigger;
  }

  /**
   * Gets the notification's unique id
   */
  getId(): ?string {
    return this._notificationId;
  }

  /**
   * Get's the notifcation's title
   */
  getTitle(): ?string {
    return this._title;
  }

  /**
   * Get's the notification's subtitle
   */
  getSubtitle(): ?string {
    return this._subtitle;
  }
}

module.exports = PushNotificationIOS;
