package br.com.cpusis.pontonorte;
import org.junit.Test;
import static org.junit.Assert.*;
public class UpdatePolicyTest {
    @Test public void rejectsUntrustedDownloadSources() {
        assertTrue(UpdatePolicy.allowedDownload("https://github.com/Delta-1/PontoNorte"));
        assertTrue(UpdatePolicy.allowedDownload("https://release-assets.githubusercontent.com/asset"));
        assertFalse(UpdatePolicy.allowedDownload("http://github.com/asset"));
        assertFalse(UpdatePolicy.allowedDownload("https://github.com.evil.example/asset"));
        assertFalse(UpdatePolicy.allowedDownload("https://user:pass@github.com/asset"));
        assertFalse(UpdatePolicy.allowedDownload("https://github.com:444/asset"));
    }
    @Test public void acceptsOnlyVersionedApksFromThisRepository() {
        assertTrue(UpdatePolicy.officialApk("https://github.com/Delta-1/PontoNorte/releases/download/android-v1005/PontoNorte.apk"));
        assertFalse(UpdatePolicy.officialApk("https://github.com/other/repo/releases/download/android-v1005/PontoNorte.apk"));
        assertFalse(UpdatePolicy.officialApk("https://github.com/Delta-1/PontoNorte/releases/download/android-latest/PontoNorte.apk"));
        assertFalse(UpdatePolicy.validHash("invalid"));
        assertTrue(UpdatePolicy.validHash("a".repeat(64)));
    }
}
