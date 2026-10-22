//! A deliberately small HTML-to-text converter for CurseForge descriptions.
//!
//! We do not need a full HTML parser: descriptions are short snippets of
//! formatting. The converter preserves paragraphs, line breaks and list items
//! and drops scripts/styles/embeds.

pub fn html_to_text(html: &str) -> String {
    let mut output = String::with_capacity(html.len());
    let bytes = html.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'<' {
            if html[i..].starts_with("<!--") {
                if let Some(end) = html[i + 4..].find("-->") {
                    i += 4 + end + 3;
                    continue;
                }
            }

            let Some(close) = html[i..].find('>') else {
                break;
            };
            let tag = &html[i + 1..i + close];
            i += close + 1;

            let tag_name = tag
                .trim()
                .trim_start_matches('/')
                .split(|c: char| c.is_whitespace() || c == '/')
                .next()
                .unwrap_or("")
                .to_ascii_lowercase();

            if tag_name == "script" || tag_name == "style" {
                let closing = format!("</{tag_name}");
                if let Some(end) = find_ascii_case_insensitive(&html[i..], &closing) {
                    if let Some(end_close) = html[i + end..].find('>') {
                        i += end + end_close + 1;
                    } else {
                        i = bytes.len();
                    }
                }
                continue;
            }

            let closing_tag = tag.trim_start().starts_with('/');
            match tag_name.as_str() {
                "br" | "hr" => output.push('\n'),
                "p" | "div" | "section" | "article" | "blockquote" | "tr" | "table" => {
                    output.push('\n');
                    if !closing_tag {
                        output.push('\n');
                    }
                }
                "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                    output.push_str("\n\n");
                }
                "ul" | "ol" => output.push('\n'),
                "li" => {
                    output.push_str("\n\n• ");
                }
                "td" | "th" => output.push_str("  "),
                "img" => {
                    // Images in descriptions are usually decorative; actual
                    // screenshots are shown separately from the gallery.
                    output.push(' ');
                }
                _ => {}
            }
            continue;
        }

        if bytes[i] == b'&' {
            if let Some(semicolon) = html[i..]
                .bytes()
                .take(12)
                .position(|byte| byte == b';')
            {
                let entity = &html[i + 1..i + semicolon];
                if let Some(decoded) = decode_entity(entity) {
                    output.push_str(&decoded);
                    i += semicolon + 1;
                    continue;
                }
            }
        }

        let ch = html[i..].chars().next().unwrap_or('\u{fffd}');
        output.push(ch);
        i += ch.len_utf8();
    }

    normalise(&output)
}

fn find_ascii_case_insensitive(haystack: &str, needle: &str) -> Option<usize> {
    haystack
        .to_ascii_lowercase()
        .find(&needle.to_ascii_lowercase())
}

fn decode_entity(entity: &str) -> Option<String> {
    let decoded = match entity {
        "amp" => "&".to_string(),
        "lt" => "<".to_string(),
        "gt" => ">".to_string(),
        "quot" => "\"".to_string(),
        "apos" => "'".to_string(),
        "nbsp" => " ".to_string(),
        "ndash" => "–".to_string(),
        "mdash" => "—".to_string(),
        "hellip" => "…".to_string(),
        "lsquo" => "‘".to_string(),
        "rsquo" => "’".to_string(),
        "ldquo" => "“".to_string(),
        "rdquo" => "”".to_string(),
        "bull" => "•".to_string(),
        "middot" => "·".to_string(),
        "laquo" => "«".to_string(),
        "raquo" => "»".to_string(),
        "copy" => "©".to_string(),
        "reg" => "®".to_string(),
        "trade" => "™".to_string(),
        "deg" => "°".to_string(),
        "times" => "×".to_string(),
        "euro" => "€".to_string(),
        _ if entity.starts_with("#x") || entity.starts_with("#X") => {
            u32::from_str_radix(&entity[2..], 16)
                .ok()
                .and_then(char::from_u32)
                .map(|ch| ch.to_string())?
        }
        _ if entity.starts_with('#') => entity[1..]
            .parse::<u32>()
            .ok()
            .and_then(char::from_u32)
            .map(|ch| ch.to_string())?,
        _ => return None,
    };
    Some(decoded)
}

fn normalise(text: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    for raw_line in text.lines() {
        let raw_line = strip_markdown_links(raw_line);
        let mut line = String::new();
        let mut last_was_space = false;
        for ch in raw_line.chars() {
            if ch == '\t' || ch == '\u{00a0}' || ch == '\u{200b}' {
                if !last_was_space {
                    line.push(' ');
                    last_was_space = true;
                }
            } else if ch.is_whitespace() {
                if !last_was_space {
                    line.push(' ');
                    last_was_space = true;
                }
            } else {
                line.push(ch);
                last_was_space = false;
            }
        }
        let line = line.trim().to_string();
        if is_bullet_only(&line) {
            // CurseForge descriptions often leave an empty list item behind,
            // which would otherwise render as a lonely bullet.
            continue;
        }
        lines.push(line);
    }

    let mut result = String::new();
    let mut blank_run = 0;
    for line in lines {
        if line.is_empty() {
            blank_run += 1;
            continue;
        }
        if !result.is_empty() {
            if blank_run > 0 {
                result.push('\n');
            }
            result.push('\n');
        }
        blank_run = 0;
        result.push_str(&line);
    }
    result.trim().to_string()
}

/// Removes empty list markers left behind by the HTML or by Markdown that
/// authors paste into the description editor.
fn is_bullet_only(line: &str) -> bool {
    !line.is_empty()
        && line
            .chars()
            .all(|ch| matches!(ch, '•' | '·' | '-' | '*' | '–' | '—' | '.'))
}

/// Turns `[label](https://…)` into `label` and drops Markdown images. Some
/// CurseForge descriptions arrive as Markdown instead of HTML, and the raw
/// link syntax looks broken in the details pane.
fn strip_markdown_links(text: &str) -> String {
    if !text.contains('[') {
        return text.to_string();
    }

    let mut output = String::with_capacity(text.len());
    let mut rest = text;

    while let Some(open) = rest.find('[') {
        output.push_str(&rest[..open]);
        let after_open = &rest[open + 1..];
        let Some(close_rel) = after_open.find(']') else {
            output.push_str(&rest[open..]);
            return output;
        };
        let close = open + 1 + close_rel;
        let after_close = &rest[close + 1..];
        if !after_close.starts_with('(') {
            output.push_str(&rest[open..=close]);
            rest = after_close;
            continue;
        }
        let Some(paren_rel) = after_close.find(')') else {
            output.push_str(&rest[open..]);
            return output;
        };

        if output.ends_with('!') {
            // Markdown image: the alt text is rarely useful once the image
            // itself is omitted, so remove the marker as well.
            output.pop();
        } else {
            output.push_str(&rest[open + 1..close]);
        }
        rest = &after_close[paren_rel + 1..];
    }

    output.push_str(rest);
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_tags_and_decodes_entities() {
        let html = "<p>Hello&nbsp;<b>World</b> &amp; friends</p><p>Second<br>line</p>";
        let text = html_to_text(html);
        assert!(text.contains("Hello World & friends"));
        assert!(text.contains("Second\nline"));
    }

    #[test]
    fn drops_scripts_and_styles() {
        let html = "<style>.x{}</style><script>alert(1)</script><p>Visible</p>";
        let text = html_to_text(html);
        assert_eq!(text, "Visible");
    }

    #[test]
    fn keeps_list_items() {
        let text = html_to_text("<ul><li>One</li><li>Two</li></ul>");
        assert!(text.contains("• One"));
        assert!(text.contains("• Two"));
    }

    #[test]
    fn drops_empty_bullets() {
        let text = html_to_text("<ul><li>Useful</li><li> </li><li><br></li></ul>");
        assert!(text.contains("• Useful"));
        assert!(!text.lines().any(|line| line.trim() == "•"));
    }

    #[test]
    fn flattens_markdown_links_and_images() {
        let text = html_to_text(
            "<p>Read [the guide](https://example.com/guide) now.</p>\
             <p>![shot](https://example.com/shot.png)</p>",
        );
        assert_eq!(text, "Read the guide now.");
    }
}
