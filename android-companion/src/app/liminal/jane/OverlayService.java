package app.liminal.jane;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.os.*;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.*;

public final class OverlayService extends Service {
    static OverlayService instance;
    private WindowManager manager;
    private ImageView art;
    private LinearLayout dock, bubble;
    private TextView status, mail;
    private WindowManager.LayoutParams artParams, dockParams, bubbleParams, hostParams;
    private CompanionWeb web;
    private SharedPreferences prefs;
    private Bitmap bitmap;
    private String asset = "", frameKey = "", label = "正在同步…", sync = "connecting";
    private int unread, width, height, safeLeft, safeTop, artWidth, artHeight;
    private boolean screenOn = true, attached, received;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable dismissSpeech = () -> removeBubble();
    private final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent intent) {
            screenOn = Intent.ACTION_SCREEN_ON.equals(intent.getAction());
            if (web != null) web.paused(!screenOn);
            visibility();
        }
    };
    @Override public void onCreate() {
        super.onCreate(); instance = this; prefs = getSharedPreferences("companion", MODE_PRIVATE);
        manager = (WindowManager)getSystemService(WINDOW_SERVICE);
        screenOn = ((PowerManager)getSystemService(POWER_SERVICE)).isInteractive();
        IntentFilter filter = new IntentFilter(); filter.addAction(Intent.ACTION_SCREEN_OFF); filter.addAction(Intent.ACTION_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screen, filter, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(screen, filter);
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        if (!Settings.canDrawOverlays(this)) { stopSelf(); return START_NOT_STICKY; }
        try {
            NotificationManager notifications = (NotificationManager)getSystemService(NOTIFICATION_SERVICE);
            notifications.createNotificationChannel(new NotificationChannel("companion", "Jane 小伴侣", NotificationManager.IMPORTANCE_LOW));
            PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            PendingIntent close = PendingIntent.getService(this, 1, new Intent(this, OverlayService.class).setAction("STOP"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification notification = new Notification.Builder(this, "companion").setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Jane 在这里").setContentText("点开留言 · 可随时收起悬浮")
                .setOngoing(true).setShowWhen(false).setContentIntent(open).addAction(new Notification.Action.Builder(null, "收起", close).build()).build();
            if (Build.VERSION.SDK_INT >= 34) startForeground(1761, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(1761, notification);
            if (web == null) initialize();
        } catch (Exception e) { Toast.makeText(this, "悬浮暂时无法开启，请重新打开小伴侣。", Toast.LENGTH_LONG).show(); stopSelf(); }
        return START_NOT_STICKY;
    }
    private void initialize() throws Exception {
        art = new ImageView(this); art.setScaleType(ImageView.ScaleType.FIT_CENTER); art.setContentDescription("Jane。轻点查看状态，双击打开原程序，长按打开留言。");
        dock = new LinearLayout(this); dock.setOrientation(LinearLayout.VERTICAL);
        mail = tag("留言"); status = tag(label);
        LinearLayout.LayoutParams tagParams = new LinearLayout.LayoutParams(-1, dp(40)); tagParams.bottomMargin = dp(4);
        dock.addView(mail, tagParams); dock.addView(status, new LinearLayout.LayoutParams(-1, dp(40)));
        mail.setOnClickListener(v -> openMail()); status.setOnClickListener(v -> speech());
        web = new CompanionWeb(this, true, new CompanionWeb.Listener() {
            public void message(JSONObject value) {
                String type = value.optString("type");
                if ("snapshot".equals(type)) {
                    String nextKey = value.optString("key"); if (!nextKey.equals(frameKey)) removeBubble(); frameKey = nextKey;
                    label = value.optString("label"); sync = value.optString("sync"); unread = value.optInt("unread"); received = true;
                    setArtwork(value.optString("assetId")); updateLabels();
                } else if ("speech".equals(type)) { if (value.optString("key").equals(frameKey)) showSpeech(value.optString("label"), value.optString("text")); }
                else if ("login".equals(type)) openMail(); else if ("error".equals(type)) failed();
            }
            public void failed() { OverlayService.this.failed(); }
        });
        // Keep the synchronizer attached to a tiny, untouchable overlay host.
        // It renders no content and is hidden together with the visible pet.
        web.view.setBackgroundColor(Color.TRANSPARENT);
        hostParams = params(1, 1); hostParams.alpha = .01f;
        hostParams.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
        manager.addView(web.view, hostParams);
        setArtwork("00_tea");
        GestureDetector gesture = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(android.view.MotionEvent e) { return true; }
            @Override public boolean onSingleTapConfirmed(android.view.MotionEvent e) { speech(); return true; }
            @Override public boolean onDoubleTap(android.view.MotionEvent e) { removeBubble(); MainActivity.openProgram(OverlayService.this); return true; }
            @Override public void onLongPress(android.view.MotionEvent e) { if (!dragged) openMail(); }
        });
        art.setOnTouchListener(new View.OnTouchListener() {
            float downX, downY; int initialX, initialY;
            public boolean onTouch(View v, android.view.MotionEvent e) {
                if (artParams == null) return true;
                if (e.getActionMasked() == android.view.MotionEvent.ACTION_DOWN) {
                    downX = e.getRawX(); downY = e.getRawY(); initialX = artParams.x; initialY = artParams.y; dragged = false; removeBubble();
                } else if (e.getActionMasked() == android.view.MotionEvent.ACTION_MOVE) {
                    int dx = Math.round(e.getRawX() - downX), dy = Math.round(e.getRawY() - downY);
                    if (Math.hypot(dx, dy) > dp(6)) dragged = true;
                    if (dragged) {
                        artParams.x = NativePolicy.clamp(initialX + dx, safeLeft, safeLeft + width - artWidth);
                        artParams.y = NativePolicy.clamp(initialY + dy, safeTop, safeTop + height - artHeight);
                        updateWindows();
                    }
                }
                if (!dragged) gesture.onTouchEvent(e);
                else if (e.getActionMasked() == android.view.MotionEvent.ACTION_MOVE) {
                    android.view.MotionEvent cancel = android.view.MotionEvent.obtain(e); cancel.setAction(android.view.MotionEvent.ACTION_CANCEL); gesture.onTouchEvent(cancel); cancel.recycle();
                }
                if (e.getActionMasked() == android.view.MotionEvent.ACTION_UP || e.getActionMasked() == android.view.MotionEvent.ACTION_CANCEL) {
                    if (dragged) {
                        int x = NativePolicy.snap(artParams.x - safeLeft, artWidth, width);
                        prefs.edit().putBoolean("right", x > 0).putFloat("vertical", (float)(artParams.y - safeTop) / Math.max(1, height - artHeight)).apply();
                        relayout();
                    }
                }
                return true;
            }
        });
        relayout(); if (!screenOn) web.paused(true);
    }
    private boolean dragged;
    private void failed() {
        sync = "unavailable"; label = "同步暂时中断"; updateLabels();
        if (web != null && web.rendererGone) { Toast.makeText(this, "小伴侣已收起，请重新打开后开启悬浮。", Toast.LENGTH_LONG).show(); stopSelf(); }
    }
    private TextView tag(String text) {
        TextView v = new TextView(this); v.setText(text); v.setTextSize(13); v.setTextColor(0xff435547);
        v.setGravity(Gravity.CENTER); v.setMaxLines(1); v.setEllipsize(TextUtils.TruncateAt.END); v.setPadding(dp(8), 0, dp(8), 0); v.setBackground(background()); return v;
    }
    private GradientDrawable background() { GradientDrawable d = new GradientDrawable(); d.setColor(0xf5ffffff); d.setCornerRadius(dp(14)); d.setStroke(dp(1), 0xffd7e0d4); return d; }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private WindowManager.LayoutParams params(int w, int h) {
        WindowManager.LayoutParams p = new WindowManager.LayoutParams(w, h, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, PixelFormat.TRANSLUCENT);
        p.gravity = Gravity.TOP | Gravity.LEFT;
        // Safe system-bar/cutout offsets are applied explicitly below.
        p.flags |= WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN;
        return p;
    }
    private void dimensions() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowMetrics metrics = manager.getCurrentWindowMetrics(); Rect area = metrics.getBounds();
            Insets insets = metrics.getWindowInsets().getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            safeLeft = insets.left; safeTop = insets.top; width = area.width() - insets.left - insets.right; height = area.height() - insets.top - insets.bottom;
        } else {
            android.util.DisplayMetrics m = new android.util.DisplayMetrics(); manager.getDefaultDisplay().getMetrics(m);
            width = m.widthPixels; height = m.heightPixels; safeLeft = 0; safeTop = dp(24); height -= safeTop;
        }
    }
    private void setArtwork(String id) {
        if (id.equals(asset) || web == null || !web.images.contains(id)) return;
        try (InputStream stream = getAssets().open("art/png/" + id + ".png")) {
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 2;
            Bitmap next = BitmapFactory.decodeStream(stream, null, options); if (next == null) return;
            bitmap = next; asset = id; art.setImageBitmap(bitmap); relayout();
        } catch (IOException ignored) {}
    }
    private void updateLabels() {
        if (status == null) return;
        status.setText(label); status.setContentDescription(label + ("connected".equals(sync) ? "" : "，当前未连接"));
        mail.setText(unread > 0 ? "留言 " + unread : "留言"); mail.setContentDescription(unread > 0 ? "有 " + unread + " 封未读留言" : "打开留言");
    }
    void relayout() {
        if (art == null || bitmap == null) return;
        removeBubble(); dimensions();
        int extent = Math.min(dp(NativePolicy.clamp(prefs.getInt("extent", 130), 80, 180)), Math.min(width, height));
        float scale = (float)extent / Math.max(bitmap.getWidth(), bitmap.getHeight());
        artWidth = Math.max(dp(24), Math.round(bitmap.getWidth() * scale)); artHeight = Math.max(dp(24), Math.round(bitmap.getHeight() * scale));
        int x = safeLeft + (prefs.getBoolean("right", true) ? Math.max(0, width - artWidth) : 0);
        int y = safeTop + Math.round(NativePolicy.clamp(Math.round(prefs.getFloat("vertical", .55f) * 10000), 0, 10000) / 10000f * Math.max(0, height - artHeight));
        if (artParams == null) { artParams = params(artWidth, artHeight); dockParams = params(dp(82), dp(84)); }
        artParams.width = artWidth; artParams.height = artHeight; artParams.x = x; artParams.y = y;
        if (!attached) {
            try { manager.addView(art, artParams); manager.addView(dock, dockParams); attached = true; }
            catch (RuntimeException e) { stopSelf(); return; }
        }
        updateWindows(); visibility();
    }
    private void updateWindows() {
        if (!attached) return;
        boolean right = artParams.x + artWidth / 2 > safeLeft + width / 2;
        dockParams.x = NativePolicy.clamp(right ? artParams.x - dp(86) : artParams.x + artWidth + dp(4), safeLeft, safeLeft + width - dp(82));
        dockParams.y = NativePolicy.clamp(artParams.y + artHeight - dp(84), safeTop, safeTop + height - dp(84));
        try { manager.updateViewLayout(art, artParams); manager.updateViewLayout(dock, dockParams); }
        catch (RuntimeException e) { stopSelf(); }
    }
    void visibility() {
        if (art == null) return;
        boolean show = screenOn && !MainActivity.active;
        art.setVisibility(show ? View.VISIBLE : View.GONE); dock.setVisibility(show && prefs.getBoolean("labels", true) ? View.VISIBLE : View.GONE);
        if (web != null) web.view.setVisibility(show ? View.VISIBLE : View.GONE);
        if (!show) removeBubble();
    }
    private void speech() {
        if (!received || "signed_out".equals(sync)) { openMail(); return; }
        if (bubble != null) { removeBubble(); return; }
        if (web != null) web.command("speech");
    }
    private void showSpeech(String title, String text) {
        if (!screenOn || MainActivity.active || !attached) return;
        removeBubble();
        bubble = new LinearLayout(this); bubble.setOrientation(LinearLayout.VERTICAL); bubble.setPadding(dp(16), dp(12), dp(12), dp(14)); bubble.setBackground(background());
        LinearLayout header = new LinearLayout(this); header.setGravity(Gravity.CENTER_VERTICAL);
        TextView state = new TextView(this); state.setText("Jane · " + title); state.setTextColor(0xff6e7b70); state.setTextSize(13); header.addView(state, new LinearLayout.LayoutParams(0, -2, 1));
        TextView close = new TextView(this); close.setText("×"); close.setTextSize(23); close.setGravity(Gravity.CENTER); close.setContentDescription("收起台词"); close.setOnClickListener(v -> removeBubble()); header.addView(close, new LinearLayout.LayoutParams(dp(40), dp(40))); bubble.addView(header);
        if (!text.isEmpty()) { TextView line = new TextView(this); line.setText(text); line.setTextColor(0xff303830); line.setTextSize(16); line.setLineSpacing(dp(4), 1); line.setMaxLines(8); line.setEllipsize(TextUtils.TruncateAt.END); bubble.addView(line); }
        int w = Math.min(dp(310), width - dp(20)); bubble.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(Math.min(dp(330), height), View.MeasureSpec.AT_MOST));
        int h = bubble.getMeasuredHeight(); bubbleParams = params(w, h);
        bubbleParams.x = NativePolicy.clamp(artParams.x + artWidth / 2 - w / 2, safeLeft + dp(10), safeLeft + width - w - dp(10));
        int y = artParams.y - h - dp(8); if (y < safeTop) y = artParams.y + artHeight + dp(8);
        bubbleParams.y = NativePolicy.clamp(y, safeTop, safeTop + height - h);
        try { manager.addView(bubble, bubbleParams); handler.postDelayed(dismissSpeech, 15000); } catch (RuntimeException e) { bubble = null; }
    }
    private void removeBubble() {
        handler.removeCallbacks(dismissSpeech); if (bubble == null) return;
        try { manager.removeView(bubble); } catch (RuntimeException ignored) {} bubble = null;
    }
    private void openMail() { removeBubble(); startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)); }
    void reconnect() { received = false; if (web != null) web.view.reload(); }
    @Override public void onConfigurationChanged(Configuration config) { super.onConfigurationChanged(config); relayout(); }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() {
        instance = null; removeBubble(); handler.removeCallbacksAndMessages(null);
        try { unregisterReceiver(screen); } catch (RuntimeException ignored) {}
        if (web != null) {
            if (web.view.isAttachedToWindow()) try { manager.removeView(web.view); } catch (RuntimeException ignored) {}
            web.destroy();
        }
        if (art != null && art.isAttachedToWindow()) try { manager.removeView(art); } catch (RuntimeException ignored) {}
        if (dock != null && dock.isAttachedToWindow()) try { manager.removeView(dock); } catch (RuntimeException ignored) {}
        stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
}
