use std::cell::RefCell;
const MAX: usize = 512 * 512;
struct World { width: usize, height: usize, cells: Vec<u8>, next: Vec<u8>, image: Vec<u8>, rgba: Vec<u8> }
thread_local! { static WORLD: RefCell<World> = RefCell::new(World { width: 0, height: 0, cells: vec![0;MAX], next: vec![0;MAX], image: vec![0;MAX*4], rgba: vec![0;MAX*4] }); }
fn advance(cells: &[u8], next: &mut [u8], width: usize, height: usize, wrap: bool) {
    for y in 0..height { for x in 0..width {
        let i = y * width + x; let mut result = 0;
        for channel in 0..3 { let bit = 1 << channel; let mut count = 0;
            for dy in -1isize..=1 { for dx in -1isize..=1 {
                if dx == 0 && dy == 0 { continue; }
                let (nx, ny) = (x as isize + dx, y as isize + dy);
                if !wrap && (nx < 0 || ny < 0 || nx >= width as isize || ny >= height as isize) { continue; }
                let j = ny.rem_euclid(height as isize) as usize * width + nx.rem_euclid(width as isize) as usize;
                count += usize::from(cells[j] & bit != 0);
            } }
            if count == 3 || (count == 2 && cells[i] & bit != 0) { result |= bit; }
        }
        next[i] = result;
    } }
}
#[unsafe(no_mangle)] pub extern "C" fn init(width: usize, height: usize) -> u32 {
    if !(3..=512).contains(&width) || !(3..=512).contains(&height) { return 0; }
    WORLD.with_borrow_mut(|w| { w.width = width; w.height = height; w.cells.fill(0); }); 1
}
#[unsafe(no_mangle)] pub extern "C" fn image_ptr() -> *mut u8 { WORLD.with_borrow_mut(|w| w.image.as_mut_ptr()) }
#[unsafe(no_mangle)] pub extern "C" fn cells_ptr() -> *const u8 { WORLD.with_borrow(|w| w.cells.as_ptr()) }
#[unsafe(no_mangle)] pub extern "C" fn seed(r: u8, g: u8, b: u8, dither: u32, invert: u32) {
    const BAYER: [u8;16] = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
    WORLD.with_borrow_mut(|w| { for i in 0..w.width*w.height { let mut bits = 0;
        for (c, threshold) in [r,g,b].iter().enumerate() {
            let value = (w.image[i*4+c] as u32 * w.image[i*4+3] as u32 / 255) as i32;
            let value = if invert != 0 { 255-value } else { value };
            let offset = if dither != 0 { (BAYER[(i/w.width%4)*4+i%w.width%4] as i32 * 16 - 120) / 2 } else { 0 };
            if value > *threshold as i32 + offset { bits |= 1 << c; }
        } w.cells[i] = bits;
    } });
}
#[unsafe(no_mangle)] pub extern "C" fn step(wrap: u32) {
    WORLD.with_borrow_mut(|w| { advance(&w.cells, &mut w.next, w.width, w.height, wrap != 0); std::mem::swap(&mut w.cells,&mut w.next); });
}
#[unsafe(no_mangle)] pub extern "C" fn render(mask: u8) -> *const u8 {
    WORLD.with_borrow_mut(|w| { for i in 0..w.width*w.height { for c in 0..3 { w.rgba[i*4+c] = if w.cells[i] & mask & (1<<c) != 0 {255} else {0}; } w.rgba[i*4+3] = 255; } w.rgba.as_ptr() })
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn independent_channels_and_synchronous_blinker() {
        let mut cells = vec![0;25]; let mut next = vec![0;25];
        for i in [11,12,13] { cells[i] |= 1; }
        for i in [6,7,11,12] { cells[i] |= 2; }
        advance(&cells,&mut next,5,5,false);
        for i in 0..25 { assert_eq!(next[i]&1, if [7,12,17].contains(&i) {1} else {0}); assert_eq!(next[i]&2,cells[i]&2); assert_eq!(next[i]&4,0); }
        advance(&next,&mut cells,5,5,false);
        for i in 0..25 { assert_eq!(cells[i]&1, if [11,12,13].contains(&i) {1} else {0}); }
    }
    #[test] fn wrapping_edges() { let mut a=vec![0;25]; let mut b=vec![0;25]; for i in [10,11,14] {a[i]=4;} advance(&a,&mut b,5,5,true); assert_eq!(b[5],4); assert_eq!(b[10],4); assert_eq!(b[15],4); advance(&a,&mut b,5,5,false); assert_eq!(b[10],0); }
}
