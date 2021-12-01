if (Test-Path -LiteralPath ./dist) {
    try {
        remove-item ./dist -Force -Recurse 
    }
    catch {
    
    }
    finally {
        
    }
}

tsc 