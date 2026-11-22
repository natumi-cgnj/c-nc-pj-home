package app.liminal.jane;

import java.net.URI;

public final class NativePolicy {
    public static final String ORIGIN = "https://natumi-cgnj.github.io";
    public static final String PREFIX = "/c-nc-pj-home/__jane_android/";
    public static final String BASE = ORIGIN + PREFIX;
    public static final String APP_URL = "https://natumi-cgnj.github.io/c-nc-pj-home/";
    public static String asset(String raw) {
        try {
            URI uri = new URI(raw);
            if (!"https".equals(uri.getScheme()) || !"natumi-cgnj.github.io".equals(uri.getHost()) ||
                uri.getRawUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)) return null;
            String path = uri.getRawPath();
            if (path == null || !path.startsWith(PREFIX) || !path.matches("/[a-zA-Z0-9_./-]{1,220}") || path.contains("..") || path.contains("//")) return null;
            return path.substring(PREFIX.length());
        } catch (Exception e) { return null; }
    }
    public static boolean page(String raw) {
        String path = asset(raw);
        return "mobile.html".equals(path) || "login.html".equals(path);
    }
    public static boolean bridgePage(String raw) { return "mobile.html".equals(asset(raw)); }
    public static boolean network(String raw) {
        try {
            URI uri = new URI(raw);
            return "https".equals(uri.getScheme()) && "lbxjshaiffklmalcxiif.supabase.co".equals(uri.getHost()) &&
                uri.getRawUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (Exception e) { return false; }
    }
    public static int clamp(int value, int min, int max) { return Math.max(min, Math.min(Math.max(min, max), value)); }
    public static int snap(int x, int width, int screenWidth) { return x + width / 2 < screenWidth / 2 ? 0 : Math.max(0, screenWidth - width); }
    private NativePolicy() {}
}
