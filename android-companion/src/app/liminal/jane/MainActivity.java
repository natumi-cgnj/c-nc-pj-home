package app.liminal.jane;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;

public final class MainActivity extends Activity {
    static boolean active;
    private CompanionWeb web;
    private Button floating;
    private boolean requestedOverlay;
    private final int green = Color.rgb(67, 85, 71);

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.WHITE);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets edges = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(edges.left, edges.top, edges.right, edges.bottom);
            } else v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        LinearLayout bar = new LinearLayout(this); bar.setGravity(Gravity.CENTER_VERTICAL); bar.setPadding(dp(14), 0, dp(8), 0);
        TextView title = new TextView(this); title.setText("Jane Companion"); title.setTextSize(18); title.setTextColor(green);
        bar.addView(title, new LinearLayout.LayoutParams(0, dp(56), 1)); title.setGravity(Gravity.CENTER_VERTICAL);
        floating = button("开启悬浮"); floating.setOnClickListener(v -> {
            if (OverlayService.instance != null) stopService(new Intent(this, OverlayService.class)); else enableOverlay();
            floating.postDelayed(this::updateButton, 250);
        }); bar.addView(floating);
        Button settings = button("设置"); settings.setOnClickListener(v -> settings()); bar.addView(settings); root.addView(bar);
        try {
            web = new CompanionWeb(this, false, new CompanionWeb.Listener() {
                public void message(org.json.JSONObject value) { if ("error".equals(value.optString("type"))) error(); }
                public void failed() { error(); }
            });
            root.addView(web.view, new LinearLayout.LayoutParams(-1, 0, 1));
        } catch (Exception e) {
            TextView failed = new TextView(this); failed.setText("小伴侣暂时无法启动。请更新 Android System WebView 后重新打开。"); failed.setPadding(dp(24), dp(24), dp(24), dp(24)); root.addView(failed);
        }
        setContentView(root); root.requestApplyInsets();
    }
    private Button button(String label) { Button b = new Button(this); b.setText(label); b.setTextSize(14); b.setTextColor(green); b.setMinWidth(0); return b; }
    private int dp(int value) { return Math.round(getResources().getDisplayMetrics().density * value); }
    private void error() { Toast.makeText(this, "暂时无法同步，可在设置中点“重新连接”。", Toast.LENGTH_LONG).show(); }
    private void updateButton() { if (floating != null) floating.setText(OverlayService.instance == null ? "开启悬浮" : "关闭悬浮"); }
    private void enableOverlay() {
        if (!Settings.canDrawOverlays(this)) {
            requestedOverlay = true;
            try { startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))); }
            catch (ActivityNotFoundException e) { requestedOverlay = false; Toast.makeText(this, "请在系统设置中允许 Jane Companion 显示在其他应用上层。", Toast.LENGTH_LONG).show(); }
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 71); return;
        }
        startOverlay();
    }
    private void startOverlay() {
        try { startForegroundService(new Intent(this, OverlayService.class)); Toast.makeText(this, "回到桌面后，Jane 就会出现。", Toast.LENGTH_SHORT).show(); }
        catch (Exception e) { Toast.makeText(this, "悬浮暂时没有开启，请重新尝试。", Toast.LENGTH_LONG).show(); }
        floating.postDelayed(this::updateButton, 400);
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(code, permissions, grants); if (code == 71) startOverlay();
    }
    @Override protected void onStart() { super.onStart(); active = true; if (OverlayService.instance != null) OverlayService.instance.visibility(); }
    @Override protected void onResume() {
        super.onResume(); if (web != null) web.paused(false); updateButton();
        if (requestedOverlay) { requestedOverlay = false; if (Settings.canDrawOverlays(this)) enableOverlay(); }
    }
    @Override protected void onPause() { if (web != null) web.paused(true); super.onPause(); }
    @Override protected void onStop() { active = false; if (OverlayService.instance != null) OverlayService.instance.visibility(); super.onStop(); }
    @Override protected void onDestroy() { if (web != null) web.destroy(); super.onDestroy(); }
    private void settings() {
        android.content.SharedPreferences prefs = getSharedPreferences("companion", MODE_PRIVATE);
        LinearLayout body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL); body.setPadding(dp(24), dp(10), dp(24), 0);
        TextView hint = new TextView(this); hint.setText("轻点 Jane：查看状态与台词\n双击 Jane：打开原程序\n长按 Jane：打开留言\n拖动后会自动贴边"); hint.setTextSize(14); hint.setLineSpacing(dp(5), 1); body.addView(hint);
        TextView size = new TextView(this); size.setText("\n人物大小"); size.setTextSize(16); body.addView(size);
        SeekBar seek = new SeekBar(this); seek.setMax(100); seek.setProgress(prefs.getInt("extent", 130) - 80); body.addView(seek);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar v, int value, boolean user) { if (user) { prefs.edit().putInt("extent", value + 80).apply(); if (OverlayService.instance != null) OverlayService.instance.relayout(); } }
            public void onStartTrackingTouch(SeekBar v) {} public void onStopTrackingTouch(SeekBar v) {}
        });
        Switch labels = new Switch(this); labels.setText("显示状态和留言标签"); labels.setTextSize(16); labels.setPadding(0, dp(12), 0, dp(12)); labels.setChecked(prefs.getBoolean("labels", true)); body.addView(labels);
        labels.setOnCheckedChangeListener((v, checked) -> { prefs.edit().putBoolean("labels", checked).apply(); if (OverlayService.instance != null) OverlayService.instance.relayout(); });
        Button reconnect = button("重新连接"); reconnect.setOnClickListener(v -> { if (web != null) { if (web.rendererGone) recreate(); else web.view.reload(); } if (OverlayService.instance != null) OverlayService.instance.reconnect(); }); body.addView(reconnect);
        Button program = button("打开原程序"); program.setOnClickListener(v -> openProgram(this)); body.addView(program);
        Button signout = button("退出此手机的账号"); signout.setOnClickListener(v -> new AlertDialog.Builder(this).setMessage("退出后，手机需要重新登录才能同步。").setNegativeButton("取消", null).setPositiveButton("退出", (d, w) -> {
            stopService(new Intent(this, OverlayService.class)); if (web != null) web.command("signOut"); updateButton();
        }).show()); body.addView(signout);
        TextView version = new TextView(this); version.setText("\n0.1.0 · 状态和留言与电脑共用云端\n人物位置、大小和已读标记保存在此设备。\n若悬浮在后台消失，可在手机的电池设置中允许本应用后台运行。"); version.setTextSize(12); version.setPadding(0, 0, 0, dp(16)); body.addView(version);
        ScrollView scroll = new ScrollView(this); scroll.addView(body);
        new AlertDialog.Builder(this).setTitle("小伴侣设置").setView(scroll).setPositiveButton("完成", null).show();
    }
    static void openProgram(Context context) {
        try { context.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(NativePolicy.APP_URL)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (ActivityNotFoundException ignored) { Toast.makeText(context, "没有找到可打开原程序的浏览器。", Toast.LENGTH_LONG).show(); }
    }
}
