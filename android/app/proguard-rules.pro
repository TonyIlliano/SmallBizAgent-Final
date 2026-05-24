# SmallBizAgent ProGuard / R8 rules
#
# Release builds run minifyEnabled + shrinkResources. The rules below preserve
# classes that ProGuard cannot otherwise prove are reachable: Capacitor and
# its plugins use reflection-heavy bridges, the WebView JS bridge uses
# annotation-based exports, and Firebase / FCM requires its messaging service
# classes to stay intact.

# Preserve source / line numbers in stack traces (helps with Crashlytics + Sentry)
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ── Capacitor core ──
-keep public class com.getcapacitor.** { *; }
-keep public class * extends com.getcapacitor.Plugin
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod *;
}
-keepclasseswithmembers class * {
    @com.getcapacitor.annotation.CapacitorPlugin <fields>;
}

# Capacitor Cordova compatibility plugins
-keep class org.apache.cordova.** { *; }
-keep public class * extends org.apache.cordova.CordovaPlugin

# ── WebView JS interface ──
# JavascriptInterface methods must keep their names so JS can call them.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Firebase / FCM (push notifications) ──
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ── AndroidX ──
-keep class androidx.** { *; }
-dontwarn androidx.**

# ── Kotlin metadata (Capacitor plugins ship as Kotlin) ──
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations
-keepattributes RuntimeVisibleParameterAnnotations,RuntimeInvisibleParameterAnnotations
-keepattributes EnclosingMethod,InnerClasses,Signature,Exceptions

# ── Project plugins (any custom Capacitor plugin registration) ──
-keep class ai.smallbizagent.app.** { *; }

# Strip noisy log calls in release builds
-assumenosideeffects class android.util.Log {
    public static *** v(...);
    public static *** d(...);
}
