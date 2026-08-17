$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$products = [System.Collections.Generic.List[object]]::new()
$seen = @{}

Get-ChildItem -LiteralPath $projectRoot -Filter 'catalog-page-*.html' | Sort-Object Name | ForEach-Object {
  $html = [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8)
  $blocks = [regex]::Matches($html, '<li class="product(?<classes>[^"]*)">(?<body>.*?)</li>', 'Singleline,IgnoreCase')
  foreach ($block in $blocks) {
    $body = $block.Groups['body'].Value
    $titleMatch = [regex]::Match($body, '<h2 class="woocommerce-loop-product__title">(?<value>.*?)</h2>', 'Singleline,IgnoreCase')
    $linkMatch = [regex]::Match($body, '<a href="(?<value>[^"]+)"', 'IgnoreCase')
    if (-not $titleMatch.Success -or -not $linkMatch.Success) { continue }
    $link = [Net.WebUtility]::HtmlDecode($linkMatch.Groups['value'].Value)
    if ($seen.ContainsKey($link)) { continue }
    $seen[$link] = $true
    $title = [Net.WebUtility]::HtmlDecode(($titleMatch.Groups['value'].Value -replace '<[^>]+>', '')).Trim()
    $imageMatch = [regex]::Match($body, 'data-src="(?<value>https://www\.ndfmakina\.com/wp-content/uploads/[^"]+)"', 'IgnoreCase')
    $priceMatch = [regex]::Match($body, '<span class="price">.*?<bdi>(?<value>.*?)</bdi>', 'Singleline,IgnoreCase')
    $priceText = if ($priceMatch.Success) { [Net.WebUtility]::HtmlDecode(($priceMatch.Groups['value'].Value -replace '<[^>]+>', '')) } else { '0' }
    $priceNumber = (($priceText -replace '[^0-9,.]', '') -replace '\.', '') -replace ',', '.'
    $price = 0
    [double]::TryParse($priceNumber, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$price) | Out-Null
    $category = 'Diğer'
    $categoryMatch = [regex]::Match($block.Groups['classes'].Value, 'product_cat-(?<value>[^ ]+)')
    if ($categoryMatch.Success) {
      $category = ($categoryMatch.Groups['value'].Value -replace '-', ' ').ToUpperInvariant()
    }
    $products.Add([ordered]@{
      id = $products.Count + 1
      name = $title
      category = $category
      price = $price
      stock = 1
      image = if ($imageMatch.Success) { $imageMatch.Groups['value'].Value } else { '' }
      url = $link
    })
  }
}

$dataDir = Join-Path $projectRoot 'src\data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$json = $products | ConvertTo-Json -Depth 4 -Compress
$output = "export interface CatalogProduct { id: number; name: string; category: string; price: number; stock: number; image: string; url: string }`n`nexport const products: CatalogProduct[] = $json`n"
[IO.File]::WriteAllText((Join-Path $dataDir 'products.ts'), $output, [Text.UTF8Encoding]::new($false))
Write-Output "Imported $($products.Count) products."
