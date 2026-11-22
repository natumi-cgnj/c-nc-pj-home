package app.liminal.jane;

public class NativePolicyTest {
    private static void expect(boolean result, String message) { if (!result) throw new AssertionError(message); }
    public static void main(String[] args) {
        expect(NativePolicy.page(NativePolicy.BASE + "mobile.html?background=1"), "background page");
        expect(NativePolicy.page(NativePolicy.BASE + "login.html"), "isolated login");
        expect(!NativePolicy.bridgePage(NativePolicy.BASE + "login.html"), "login has no native bridge capability");
        expect(!NativePolicy.page(NativePolicy.APP_URL), "main app is never loaded into privileged webview");
        expect(!NativePolicy.page("https://natumi-cgnj.github.io.evil" + NativePolicy.PREFIX + "mobile.html"), "exact bundled origin");
        expect(!NativePolicy.page("https://evil@natumi-cgnj.github.io" + NativePolicy.PREFIX + "mobile.html"), "reject user-info");
        expect(!NativePolicy.page(NativePolicy.BASE + "%2e%2e/mobile.html"), "reject encoded traversal");
        String[] rejected = {"http://jane-companion.local/mobile.html", "https://jane-companion.local.evil/mobile.html", "https://evil@jane-companion.local/mobile.html", "https://jane-companion.local:8443/mobile.html", "https://jane-companion.local/%2e%2e/private", "https://jane-companion.local/../private", "file:///mobile.html", "javascript:alert(1)", "https://jane-companion.local//mobile.html"};
        for (String url : rejected) expect(NativePolicy.asset(url) == null && !NativePolicy.page(url), "rejected: " + url);
        expect(NativePolicy.network("https://lbxjshaiffklmalcxiif.supabase.co/auth/v1/token"), "exact authenticated backend");
        expect(!NativePolicy.network("https://lbxjshaiffklmalcxiif.supabase.co.evil/auth/v1/token"), "backend suffix attack");
        expect(!NativePolicy.network("https://user@lbxjshaiffklmalcxiif.supabase.co/auth/v1/token"), "backend user-info attack");
        for (int screen : new int[]{240, 360, 720, 1080, 2400}) for (int art : new int[]{50, 130, 180}) {
            expect(NativePolicy.snap(-100, art, screen) == 0, "left edge");
            expect(NativePolicy.snap(screen, art, screen) == screen - art, "right edge");
            for (int x = -100; x <= screen + 100; x += 37) {
                int position = NativePolicy.snap(x, art, screen);
                expect(position >= 0 && position + art <= screen, "art stays inside rotated/narrow screens");
            }
        }
        expect(NativePolicy.clamp(12, 20, 10) == 20, "degenerate bounds");
        System.out.println("Native navigation, backend boundary and edge geometry checks passed.");
    }
}
