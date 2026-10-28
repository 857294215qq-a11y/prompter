package com.tcq.prompter;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.DhcpInfo;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 网页和安卓之间的桥：局域网遥控（服务器 + 设备发现）、保持亮屏、全屏、把录像存进相册。
 * 网页里通过 Capacitor.Plugins.Link 调用。
 */
@CapacitorPlugin(name = "Link")
public class LinkPlugin extends Plugin {
    private LanCore core;
    private WifiManager.MulticastLock mlock;
    private boolean announcing = false;
    private boolean discovering = false;

    private static class Save {
        Uri uri;
        OutputStream out;
    }

    private final Map<String, Save> saves = new ConcurrentHashMap<>();
    private final AtomicInteger saveSeq = new AtomicInteger();

    @Override
    public void load() {
        core = new LanCore(new LanCore.Listener() {
            @Override
            public void onClientOpen(String cid, String addr) {
                JSObject o = new JSObject();
                o.put("cid", cid);
                o.put("addr", addr);
                notifyListeners("clientOpen", o);
            }

            @Override
            public void onClientMessage(String cid, String text) {
                JSObject o = new JSObject();
                o.put("cid", cid);
                o.put("text", text);
                notifyListeners("clientMessage", o);
            }

            @Override
            public void onClientClose(String cid) {
                JSObject o = new JSObject();
                o.put("cid", cid);
                notifyListeners("clientClose", o);
            }

            @Override
            public void onPeerFound(String id, String alias, String ip, int port) {
                JSObject o = new JSObject();
                o.put("id", id);
                o.put("alias", alias);
                o.put("ip", ip);
                o.put("port", port);
                notifyListeners("peerFound", o);
            }

            @Override
            public void onPeerLost(String id) {
                JSObject o = new JSObject();
                o.put("id", id);
                notifyListeners("peerLost", o);
            }

            @Override
            public void onError(String where, String msg) {
                JSObject o = new JSObject();
                o.put("where", where);
                o.put("msg", msg);
                notifyListeners("linkError", o);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (core != null) core.shutdown();
        releaseMulticast();
    }

    // ------------------------------------------------------------ 设备信息

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject o = new JSObject();
        o.put("model", Build.MODEL);
        o.put("manufacturer", Build.MANUFACTURER);
        o.put("sdk", Build.VERSION.SDK_INT);
        JSArray ips = new JSArray();
        for (String ip : LanCore.localIps()) ips.put(ip);
        o.put("ips", ips);
        o.put("gateway", gateway());
        call.resolve(o);
    }

    /** 连着 Wi-Fi / 热点时的网关地址。遥控手机连提词设备的热点时，网关就是提词设备。 */
    private String gateway() {
        try {
            WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            DhcpInfo d = wm == null ? null : wm.getDhcpInfo();
            if (d == null || d.gateway == 0) return "";
            int g = d.gateway;
            return (g & 0xff) + "." + ((g >> 8) & 0xff) + "." + ((g >> 16) & 0xff) + "." + ((g >> 24) & 0xff);
        } catch (Exception e) {
            return "";
        }
    }

    // ------------------------------------------------------------ 服务器

    @PluginMethod
    public void startServer(PluginCall call) {
        try {
            int port = core.startServer(call.getInt("port", 53321));
            JSObject o = new JSObject();
            o.put("port", port);
            call.resolve(o);
        } catch (Exception e) {
            call.reject("启动失败：" + e.getMessage());
        }
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        core.stopServer();
        call.resolve();
    }

    @PluginMethod
    public void sendTo(PluginCall call) {
        String cid = call.getString("cid");
        String text = call.getString("text");
        if (cid != null && text != null) core.sendTo(cid, text);
        call.resolve();
    }

    @PluginMethod
    public void closeClient(PluginCall call) {
        String cid = call.getString("cid");
        if (cid != null) core.closeClient(cid);
        call.resolve();
    }

    // ------------------------------------------------------------ 设备发现

    @PluginMethod
    public void startAnnounce(PluginCall call) {
        try {
            acquireMulticast();
            core.setExtraTargets(extraTargets(call));
            core.startAnnounce(call.getString("id", ""), call.getString("alias", ""), call.getInt("port", 53321));
            announcing = true;
            call.resolve();
        } catch (Exception e) {
            call.reject("无法广播：" + e.getMessage());
        }
    }

    @PluginMethod
    public void stopAnnounce(PluginCall call) {
        core.stopAnnounce();
        announcing = false;
        if (!discovering) releaseMulticast();
        call.resolve();
    }

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        try {
            acquireMulticast();
            core.setExtraTargets(extraTargets(call));
            core.startDiscovery(call.getString("id", ""));
            discovering = true;
            call.resolve();
        } catch (Exception e) {
            call.reject("无法搜索设备：" + e.getMessage());
        }
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        core.stopDiscovery();
        discovering = false;
        if (!announcing) releaseMulticast();
        call.resolve();
    }

    private List<String> extraTargets(PluginCall call) {
        List<String> out = new ArrayList<>();
        String gw = gateway();
        if (!gw.isEmpty()) out.add(gw); // 遥控手机连着提词设备的热点：直接问网关，不依赖广播能不能通
        String extra = call.getString("target", "");
        if (extra != null && !extra.isEmpty()) out.add(extra);
        return out;
    }

    private void acquireMulticast() {
        if (mlock != null) return;
        try {
            WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                mlock = wm.createMulticastLock("tcq-prompter");
                mlock.setReferenceCounted(false);
                mlock.acquire();
            }
        } catch (Exception ignore) {
            mlock = null;
        }
    }

    private void releaseMulticast() {
        try {
            if (mlock != null && mlock.isHeld()) mlock.release();
        } catch (Exception ignore) {
        }
        mlock = null;
    }

    // ------------------------------------------------------------ 屏幕

    @PluginMethod
    public void keepAwake(final PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        getActivity().runOnUiThread(() -> {
            Window w = getActivity().getWindow();
            if (on) w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else w.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    @PluginMethod
    public void setFullscreen(final PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        getActivity().runOnUiThread(() -> {
            View v = getActivity().getWindow().getDecorView();
            if (on) {
                v.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
            } else {
                v.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            }
            call.resolve();
        });
    }

    // ------------------------------------------------------------ 把录像存进相册

    @PluginMethod
    public void saveBegin(PluginCall call) {
        try {
            String name = call.getString("name", "提词器.mp4");
            String mime = call.getString("mime", "video/mp4");
            ContentResolver r = getContext().getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.Video.Media.DISPLAY_NAME, name);
            v.put(MediaStore.Video.Media.MIME_TYPE, mime);
            v.put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/提词器");
            v.put(MediaStore.Video.Media.IS_PENDING, 1);
            Uri uri = r.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v);
            if (uri == null) {
                call.reject("无法创建文件");
                return;
            }
            Save s = new Save();
            s.uri = uri;
            s.out = r.openOutputStream(uri);
            if (s.out == null) {
                call.reject("无法写入文件");
                return;
            }
            String id = "s" + saveSeq.incrementAndGet();
            saves.put(id, s);
            JSObject o = new JSObject();
            o.put("id", id);
            call.resolve(o);
        } catch (Exception e) {
            call.reject("保存失败：" + e.getMessage());
        }
    }

    @PluginMethod
    public void saveChunk(PluginCall call) {
        Save s = saves.get(call.getString("id", ""));
        String data = call.getString("data");
        if (s == null || data == null) {
            call.reject("保存已中断");
            return;
        }
        try {
            s.out.write(Base64.decode(data, Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) {
            call.reject("写入失败：" + e.getMessage());
        }
    }

    @PluginMethod
    public void saveEnd(PluginCall call) {
        Save s = saves.remove(call.getString("id", ""));
        if (s == null) {
            call.reject("保存已中断");
            return;
        }
        try {
            s.out.close();
            ContentValues v = new ContentValues();
            v.put(MediaStore.Video.Media.IS_PENDING, 0);
            getContext().getContentResolver().update(s.uri, v, null, null);
            JSObject o = new JSObject();
            o.put("uri", s.uri.toString());
            call.resolve(o);
        } catch (Exception e) {
            call.reject("保存失败：" + e.getMessage());
        }
    }

    @PluginMethod
    public void saveAbort(PluginCall call) {
        Save s = saves.remove(call.getString("id", ""));
        if (s != null) {
            try {
                s.out.close();
            } catch (Exception ignore) {
            }
            try {
                getContext().getContentResolver().delete(s.uri, null, null);
            } catch (Exception ignore) {
            }
        }
        call.resolve();
    }
}
