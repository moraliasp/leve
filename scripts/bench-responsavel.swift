// Para cada pid recebido, imprime "pid responsável". No macOS, os processos do WebKit (WebContent,
// GPU, Networking) são serviços XPC filhos do launchd (ppid 1), não do app; o kernel guarda o
// "processo responsável" de cada um, que é o app que os pediu. É o mesmo vínculo que o Monitor de
// Atividade usa para agrupar o WebContent sob o app. Só leitura. Usado por scripts/bench.mjs.
import Darwin

@_silgen_name("responsibility_get_pid_responsible_for_pid")
func responsibility_get_pid_responsible_for_pid(_ pid: pid_t) -> pid_t

for arg in CommandLine.arguments.dropFirst() {
    guard let pid = pid_t(arg) else { continue }
    print("\(pid) \(responsibility_get_pid_responsible_for_pid(pid))")
}
