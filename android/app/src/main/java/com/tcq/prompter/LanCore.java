package com.tcq.prompter;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 局域网内的两件事，不依赖任何安卓类，方便在电脑上直接测试：
 * 1. 一个 WebSocket 服务器，接收遥控器发来的消息，把提词状态推回去
 * 2. 用 UDP 广播互相发现：提词设备不断广播"我在这里"，遥控器收到后列出来
 */
public class LanCore {
    public interface Listener {
        void onClientOpen(String cid, String addr);
        void onClientMessage(String cid, String text);
        void onClientClose(String cid);
        void onPeerFound(String id, String alias, String ip, int port);
        void onPeerLost(String id);
        void onError(String where, String msg);
    }

    private static final String MAGIC = "TCQ1";
    private static final long PEER_TTL_MS = 7000;

    private final Listener listener;
    private final AtomicInteger seq = new AtomicInteger();

    // ---- WebSocket 服务器 ----
    private WebSocketServer server;
    private final Map<String, WebSocket> clients = new ConcurrentHashMap<>();

    // ---- 设备发现 ----
    private int discoveryPort = 53320;
    private final List<InetAddress> extraTargets = new ArrayList<>();
    private DatagramSocket sock;
    private Thread rx;
    private ScheduledExecutorService sched;
    private boolean announcing = false;
    private boolean discovering = false;
    private String selfId = "";
    private String selfAlias = "";
    private int selfPort = 0;
    private final Map<String, Peer> peers = new ConcurrentHashMap<>();

    private static class Peer {
        String alias;
        String ip;
        int port;
        long seen;
    }

    public LanCore(Listener listener) {
        this.listener = listener;
    }

    // =====================================================================
    // WebSocket 服务器
    // =====================================================================

    /** 从 preferred 开始找一个空闲端口，启动服务器，返回实际端口。 */
    public synchronized int startServer(int preferred) throws Exception {
        stopServer();
        int port = -1;
        for (int i = 0; i < 20; i++) {
            try (ServerSocket probe = new ServerSocket(preferred + i)) {
                port = probe.getLocalPort();
                break;
            } catch (Exception ignore) {
                // 被占用，试下一个
            }
        }
        if (port < 0) throw new Exception("没有可用端口");

        final CountDownLatch up = new CountDownLatch(1);
        final Exception[] failure = new Exception[1];
        WebSocketServer s = new WebSocketServer(new InetSocketAddress(port)) {
            @Override
            public void onOpen(WebSocket conn, ClientHandshake handshake) {
                String cid = "c" + seq.incrementAndGet();
                conn.setAttachment(cid);
                clients.put(cid, conn);
                InetSocketAddress a = conn.getRemoteSocketAddress();
                listener.onClientOpen(cid, a == null ? "" : a.getAddress().getHostAddress());
            }

            @Override
            public void onClose(WebSocket conn, int code, String reason, boolean remote) {
                String cid = conn.getAttachment();
                if (cid != null) {
                    clients.remove(cid);
                    listener.onClientClose(cid);
                }
            }

            @Override
            public void onMessage(WebSocket conn, String message) {
                String cid = conn.getAttachment();
                if (cid != null) listener.onClientMessage(cid, message);
            }

            @Override
            public void onError(WebSocket conn, Exception ex) {
                if (conn == null) failure[0] = ex;
                listener.onError("server", String.valueOf(ex));
            }

            @Override
            public void onStart() {
                up.countDown();
            }
        };
        s.setReuseAddr(true);
        s.setConnectionLostTimeout(10);
        s.start();
        if (!up.await(4, TimeUnit.SECONDS) || failure[0] != null) {
            try {
                s.stop(100);
            } catch (Exception ignore) {
            }
            throw failure[0] != null ? failure[0] : new Exception("服务器启动超时");
        }
        server = s;
        return port;
    }

    public synchronized void stopServer() {
        WebSocketServer s = server;
        server = null;
        clients.clear();
        if (s != null) {
            try {
                s.stop(200);
            } catch (Exception ignore) {
            }
        }
    }

    public void sendTo(String cid, String text) {
        WebSocket c = clients.get(cid);
        if (c != null && c.isOpen()) {
            try {
                c.send(text);
            } catch (Exception ignore) {
            }
        }
    }

    public void closeClient(String cid) {
        WebSocket c = clients.get(cid);
        if (c != null) {
            try {
                c.close();
            } catch (Exception ignore) {
            }
        }
    }

    // =====================================================================
    // 设备发现（UDP 广播）
    // =====================================================================

    public synchronized void setDiscoveryPort(int port) {
        this.discoveryPort = port;
    }

    /** 额外的目标地址（热点网关、测试用的回环地址）。 */
    public synchronized void setExtraTargets(List<String> ips) {
        extraTargets.clear();
        if (ips == null) return;
        for (String ip : ips) {
            try {
                extraTargets.add(InetAddress.getByName(ip));
            } catch (Exception ignore) {
            }
        }
    }

    public synchronized void startAnnounce(String id, String alias, int port) throws Exception {
        selfId = id;
        selfAlias = clean(alias);
        selfPort = port;
        announcing = true;
        ensureSocket();
    }

    public synchronized void stopAnnounce() {
        announcing = false;
        closeIfIdle();
    }

    public synchronized void startDiscovery(String id) throws Exception {
        selfId = id;
        discovering = true;
        ensureSocket();
        sendQuery();
    }

    public synchronized void stopDiscovery() {
        discovering = false;
        for (String pid : new ArrayList<>(peers.keySet())) {
            peers.remove(pid);
            listener.onPeerLost(pid);
        }
        closeIfIdle();
    }

    private static String clean(String s) {
        return (s == null ? "" : s).replace("|", " ").replace("\n", " ").trim();
    }

    private void ensureSocket() throws Exception {
        if (sock != null && !sock.isClosed()) return;
        DatagramSocket s = new DatagramSocket(null);
        s.setReuseAddress(true);
        s.setBroadcast(true);
        s.bind(new InetSocketAddress(discoveryPort));
        sock = s;
        rx = new Thread(() -> receiveLoop(s), "lan-rx");
        rx.setDaemon(true);
        rx.start();
        sched = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "lan-tick");
            t.setDaemon(true);
            return t;
        });
        sched.scheduleWithFixedDelay(this::tick, 0, 1500, TimeUnit.MILLISECONDS);
    }

    private synchronized void closeIfIdle() {
        if (announcing || discovering) return;
        if (sched != null) {
            sched.shutdownNow();
            sched = null;
        }
        if (sock != null) {
            sock.close();
            sock = null;
        }
    }

    private void tick() {
        try {
            boolean a, d;
            synchronized (this) {
                a = announcing;
                d = discovering;
            }
            if (a) sendAnnounce(null);
            if (d) sendQuery();
            long now = System.currentTimeMillis();
            for (Map.Entry<String, Peer> e : peers.entrySet()) {
                if (now - e.getValue().seen > PEER_TTL_MS) {
                    if (peers.remove(e.getKey()) != null) listener.onPeerLost(e.getKey());
                }
            }
        } catch (Exception ex) {
            listener.onError("tick", String.valueOf(ex));
        }
    }

    private void receiveLoop(DatagramSocket s) {
        byte[] buf = new byte[1024];
        while (!s.isClosed()) {
            try {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                s.receive(p);
                handlePacket(new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8), p.getAddress());
            } catch (Exception e) {
                if (!s.isClosed()) listener.onError("rx", String.valueOf(e));
            }
        }
    }

    private void handlePacket(String text, InetAddress from) {
        String[] f = text.split("\\|", -1);
        if (f.length < 3 || !MAGIC.equals(f[0])) return;
        String type = f[1], id = f[2];
        if (id.equals(selfId)) return;
        if ("A".equals(type) && f.length >= 5 && discovering) {
            int port;
            try {
                port = Integer.parseInt(f[4]);
            } catch (NumberFormatException e) {
                return;
            }
            String ip = from.getHostAddress();
            Peer old = peers.get(id);
            Peer p = new Peer();
            p.alias = f[3];
            p.ip = ip;
            p.port = port;
            p.seen = System.currentTimeMillis();
            peers.put(id, p);
            if (old == null || !old.ip.equals(ip) || old.port != port || !old.alias.equals(p.alias)) {
                listener.onPeerFound(id, p.alias, ip, port);
            }
        } else if ("Q".equals(type) && announcing) {
            sendAnnounce(from); // 有人在找，马上单独回复一次
        }
    }

    private void sendAnnounce(InetAddress only) {
        String msg = MAGIC + "|A|" + selfId + "|" + selfAlias + "|" + selfPort;
        if (only != null) send(msg, Collections.singletonList(only));
        else send(msg, targets());
    }

    private void sendQuery() {
        send(MAGIC + "|Q|" + selfId, targets());
    }

    private void send(String msg, List<InetAddress> to) {
        DatagramSocket s = sock;
        if (s == null || s.isClosed()) return;
        byte[] b = msg.getBytes(StandardCharsets.UTF_8);
        for (InetAddress a : to) {
            try {
                s.send(new DatagramPacket(b, b.length, a, discoveryPort));
            } catch (Exception ignore) {
                // 某个网卡不可用，不影响其他的
            }
        }
    }

    private synchronized List<InetAddress> targets() {
        List<InetAddress> out = new ArrayList<>();
        try {
            out.add(InetAddress.getByName("255.255.255.255"));
        } catch (Exception ignore) {
        }
        try {
            Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces();
            while (en != null && en.hasMoreElements()) {
                NetworkInterface ni = en.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    if (ia.getAddress() instanceof Inet4Address && ia.getBroadcast() != null) out.add(ia.getBroadcast());
                }
            }
        } catch (Exception ignore) {
        }
        out.addAll(extraTargets);
        return out;
    }

    /** 本机的 IPv4 地址（排除回环）。 */
    public static List<String> localIps() {
        List<String> out = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces();
            while (en != null && en.hasMoreElements()) {
                NetworkInterface ni = en.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                Enumeration<InetAddress> ads = ni.getInetAddresses();
                while (ads.hasMoreElements()) {
                    InetAddress a = ads.nextElement();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) out.add(a.getHostAddress());
                }
            }
        } catch (Exception ignore) {
        }
        return out;
    }

    public synchronized void shutdown() {
        announcing = false;
        discovering = false;
        closeIfIdle();
        stopServer();
        peers.clear();
    }
}
