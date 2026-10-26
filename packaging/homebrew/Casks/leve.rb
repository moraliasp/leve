cask "leve" do
  version "0.2.0"
  sha256 "f3b9d08363e18522cb755a9ffed9f955541eea5e701ee0818d5cba49bcc7a4de"

  url "https://github.com/moraliasp/leve/releases/download/v#{version}/Leve_#{version}_universal.dmg"
  name "Leve"
  desc "Small, fast, private Markdown viewer"
  homepage "https://github.com/moraliasp/leve"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on :macos

  app "Leve.app"

  zap trash: [
    "~/Library/Application Support/br.com.moralia.leve",
    "~/Library/Caches/br.com.moralia.leve",
    "~/Library/HTTPStorages/br.com.moralia.leve",
    "~/Library/Preferences/br.com.moralia.leve.plist",
    "~/Library/Saved Application State/br.com.moralia.leve.savedState",
    "~/Library/WebKit/br.com.moralia.leve",
  ]

  caveats <<~EOS
    Leve is not signed or notarized by Apple yet, so macOS blocks the first launch.
    Open Leve once, click Done, then go to System Settings > Privacy & Security
    and click Open Anyway. macOS may ask again after brew upgrade.
    Or remove the quarantine flag yourself, if you trust this download:
      xattr -dr com.apple.quarantine "#{appdir}/Leve.app"
    Checksums and build provenance: https://github.com/moraliasp/leve/releases
  EOS
end
