$htmlFiles = Get-ChildItem -Path "e:\App\crm\*.html" -File

foreach ($file in $htmlFiles) {
    if ($file.Name -match "admin_clients.html" -or $file.Name -match "admin_client_detail.html") {
        continue
    }
    
    $content = Get-Content $file.FullName -Raw

    # INIETTA IL FOGLIO STILE
    if ($content -notmatch 'apple_vision_theme\.css') {
        $content = [regex]::Replace($content, '(<link rel="stylesheet" href="assets/css/dash\.css[^>]*>)', "`$1`r`n  <link rel=""stylesheet"" href=""assets/css/apple_vision_theme.css?v=2""/>", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    }

    # SOSTITUISCI IL LOGO OPACO CON L'SVG VETTORIALE
    $patternLogo = '<img\s+src="/assets/img/nova-crm-logo\.jpeg"\s+alt="Nova CRM"\s+class="sidebar-brand-logo"\s+loading="eager"\s+fetchpriority="high"\s+width="140"\s+height="46">'
    $replacementLogo = '<img src="/assets/img/nova-crm-logo-sidebar.svg" alt="Nova CRM" class="sidebar-brand-logo" loading="eager" fetchpriority="high" width="140" style="mix-blend-mode: multiply;" height="auto" onerror="this.src=''/assets/img/nova-crm-logo.jpeg''">'
    
    $content = [regex]::Replace($content, $patternLogo, $replacementLogo, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

    Set-Content -Path $file.FullName -Value $content -NoNewline
}
echo "APPLE VISION THEME PROPAGATED GLOBALLY DONE."
