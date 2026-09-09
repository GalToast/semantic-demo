import ctypes
import socket
import subprocess

# --- RAM ---
try:
    kernel32 = ctypes.windll.kernel32

    class MS(ctypes.Structure):
        _fields_ = [
            ("dwLength", ctypes.c_ulong),
            ("dwMemoryLoad", ctypes.c_ulong),
            ("ullTotalPhys", ctypes.c_ulonglong),
            ("ullAvailPhys", ctypes.c_ulonglong),
            ("ullTotalVirtual", ctypes.c_ulonglong),
            ("ullAvailVirtual", ctypes.c_ulonglong),
            ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
        ]

    m = MS()
    m.dwLength = ctypes.sizeof(m)
    kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
    print(
        f"RAM: total={m.ullTotalPhys / 1e6:.1f} MB "
        f"avail={m.ullAvailPhys / 1e6:.1f} MB load={m.dwMemoryLoad}%"
    )
except Exception as e:  # noqa: BLE001
    print("RAM probe failed:", e)

# --- ports ---
print("\nlistening on loopback:")
for port in [8083, 8788, 8789, 8795, 8796, 8797, 8806]:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.4)
    r = s.connect_ex(("127.0.0.1", port))
    s.close()
    print(f"  {port}: {'LISTENING' if r == 0 else 'closed'}")

# --- process command lines via WMI ---
print("\npython procs (command line):")
try:
    out = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'python' } | "
            "Select-Object ProcessId, Name, CommandLine | Format-List",
        ],
        capture_output=True,
        text=True,
        timeout=25,
    )
    print(out.stdout[:2500])
except Exception as e:  # noqa: BLE001
    print("  probe failed:", e)
