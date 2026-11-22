package app.liminal.jane;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.*;
import org.json.*;
import java.io.*;
import java.util.*;

final class CompanionWeb {
    interface Listener { void message(JSONObject value); void failed(); }
    final WebView view;
    final JSONObject manifest;
    final Set<String> images = new HashSet<>();
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile String nonce = "";
    private boolean destroyed;
    private boolean paused;
    boolean rendererGone;
    private final Listener listener;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    CompanionWeb(Context context, boolean background, Listener listener) throws Exception {
        this.listener = listener;
        try (InputStream stream = context.getAssets().open("site/manifest.json")) {
            manifest = new JSONObject(read(stream));
        }
        JSONArray all = manifest.getJSONArray("images");
        for (int i = 0; i < all.length(); i++) images.add(all.getJSONObject(i).getString("id"));
        view = new WebView(context);
        view.setBackgroundColor(0xfff8f8f7);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true); settings.setSaveFormData(false);
        settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false);
        view.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) { callback.invoke(origin, false, false); }
            @Override public boolean onShowFileChooser(WebView v, android.webkit.ValueCallback<Uri[]> callback, FileChooserParams params) { return false; }
        });
        view.addJavascriptInterface(new Object() {
            @JavascriptInterface public void postMessage(String token, String payload) {
                if (token == null || payload == null || token.length() != 36 || payload.length() > 16384) return;
                main.post(() -> {
                    if (destroyed || !token.equals(nonce) || !NativePolicy.bridgePage(view.getUrl())) return;
                    try {
                        JSONObject value = new JSONObject(payload);
                        String type = value.optString("type");
                        if ("snapshot".equals(type)) {
                            if (!images.contains(value.optString("assetId")) || value.optString("label").length() > 180 ||
                                value.optString("key").length() > 1000 || value.optInt("unread", -1) < 0 || value.optInt("unread") > 1000) return;
                        } else if ("speech".equals(type)) {
                            if (value.optString("label").length() > 180 || value.optString("text").length() > 3000) return;
                        } else if (!Arrays.asList("login", "error").contains(type)) return;
                        listener.message(value);
                    } catch (JSONException ignored) {}
                });
            }
        }, "JaneAndroid");
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return !r.isForMainFrame() || !NativePolicy.page(r.getUrl().toString());
            }
            @Override public void onPageStarted(WebView v, String url, Bitmap favicon) { nonce = ""; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                String raw = r.getUrl().toString(), path = NativePolicy.asset(raw);
                if (path == null) return NativePolicy.network(raw) ? null : blocked();
                if (!"GET".equals(r.getMethod())) return blocked();
                if (r.isForMainFrame() && !NativePolicy.page(raw)) return blocked();
                try {
                    String file;
                    if (path.startsWith("art/")) {
                        String id = path.substring(4);
                        if (!id.endsWith(".png") || !images.contains(id.substring(0, id.length() - 4))) return blocked();
                        file = "art/png/" + id;
                    } else file = "site/" + path;
                    String mime = path.endsWith(".html") ? "text/html" : path.endsWith(".css") ? "text/css" :
                        path.endsWith(".js") || path.endsWith(".mjs") ? "text/javascript" : path.endsWith(".json") ? "application/json" : "image/png";
                    return new WebResourceResponse(mime, path.endsWith(".png") ? null : "UTF-8", 200, "OK",
                        Collections.singletonMap("X-Content-Type-Options", "nosniff"), context.getAssets().open(file));
                } catch (IOException e) { return blocked(); }
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (!destroyed && NativePolicy.bridgePage(url)) {
                    nonce = UUID.randomUUID().toString();
                    v.evaluateJavascript("window.__janePaused=" + paused + ";window.__janeConnect && window.__janeConnect(" + JSONObject.quote(nonce) + ")", null);
                }
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) listener.failed();
            }
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                nonce = ""; rendererGone = true; listener.failed(); return true;
            }
        });
        view.loadUrl(NativePolicy.BASE + "mobile.html" + (background ? "?background=1" : ""));
    }
    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    static String read(InputStream input) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int count;
        while ((count = input.read(buffer)) != -1) out.write(buffer, 0, count);
        return out.toString("UTF-8");
    }
    void command(String name) {
        if (destroyed || !NativePolicy.bridgePage(view.getUrl())) return;
        if (!Arrays.asList("speech", "refresh", "signOut").contains(name)) return;
        view.evaluateJavascript("window.JaneMobile && window.JaneMobile." + name + "()", null);
    }
    void paused(boolean value) {
        if (destroyed) return;
        paused = value;
        view.evaluateJavascript("window.__janePaused=" + value + ";window.JaneMobile && window.JaneMobile.setPaused(" + value + ")", null);
        if (value) view.onPause(); else view.onResume();
    }
    void destroy() {
        if (destroyed) return; destroyed = true; nonce = "";
        if (view.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup)view.getParent()).removeView(view);
        view.removeJavascriptInterface("JaneAndroid"); view.stopLoading(); view.destroy();
    }
}
