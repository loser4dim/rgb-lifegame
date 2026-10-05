use std::cell::RefCell;
const MAX_WIDTH: usize = 1920;
const MAX_HEIGHT: usize = 1080;
const MAX: usize = MAX_WIDTH * MAX_HEIGHT;
struct World { width: usize, height: usize, cells: Vec<u8>, next: Vec<u8>, image: Vec<u8>, rgba: Vec<u8>, thresholds: [i32;3] }
thread_local! { static WORLD: RefCell<World> = RefCell::new(World { width: 0, height: 0, cells: vec![0;MAX], next: vec![0;MAX], image: vec![0;MAX*4], rgba: vec![0;MAX*4], thresholds: [127;3] }); }
fn advance(cells: &[u8], next: &mut [u8], width: usize, height: usize, wrap: bool) {
    if width == 0 || height == 0 { return; }
    for y in 0..height { for x in 0..width {
        let i = y * width + x;
        let mut counts = [0u8; 3];
        for dy in -1isize..=1 {
            let ny = y as isize + dy;
            if !wrap && (ny < 0 || ny >= height as isize) { continue; }
            let yy = if ny < 0 { height - 1 } else if ny >= height as isize { 0 } else { ny as usize };
            for dx in -1isize..=1 {
                if dx == 0 && dy == 0 { continue; }
                let nx = x as isize + dx;
                if !wrap && (nx < 0 || nx >= width as isize) { continue; }
                let xx = if nx < 0 { width - 1 } else if nx >= width as isize { 0 } else { nx as usize };
                let cell = cells[yy * width + xx];
                counts[0] += cell & 1;
                counts[1] += (cell >> 1) & 1;
                counts[2] += (cell >> 2) & 1;
            }
        }
        let mut result = 0;
        for (channel, count) in counts.into_iter().enumerate() {
            let bit = 1 << channel;
            if count == 3 || (count == 2 && cells[i] & bit != 0) { result |= bit; }
        }
        next[i] = result;
    } }
}
#[unsafe(no_mangle)] pub extern "C" fn init(width: usize, height: usize) -> u32 {
    if !(3..=MAX_WIDTH).contains(&width) || !(3..=MAX_HEIGHT).contains(&height) { return 0; }
    WORLD.with_borrow_mut(|w| { w.width = width; w.height = height; w.cells.fill(0); }); 1
}
#[unsafe(no_mangle)] pub extern "C" fn image_ptr() -> *mut u8 { WORLD.with_borrow_mut(|w| w.image.as_mut_ptr()) }
#[unsafe(no_mangle)] pub extern "C" fn cells_ptr() -> *const u8 { WORLD.with_borrow(|w| w.cells.as_ptr()) }
const BAYER: [u8;16] = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
fn adjusted(w: &World, i: usize, c: usize, dither: bool, invert: bool) -> i32 {
    let value = (w.image[i*4+c] as u32 * w.image[i*4+3] as u32 / 255) as i32;
    let value = if invert { 255-value } else { value };
    let offset = if dither { (BAYER[(i/w.width%4)*4+i%w.width%4] as i32 * 16 - 120) / 2 } else { 0 };
    value-offset
}
fn fill_seed(w: &mut World, dither: bool, invert: bool) {
    for i in 0..w.width*w.height {
        let mut bits=0;
        if w.image[i*4+3]!=0 { for c in 0..3 { if adjusted(w,i,c,dither,invert)>w.thresholds[c] {bits|=1<<c;} } }
        w.cells[i]=bits;
    }
}
#[unsafe(no_mangle)] pub extern "C" fn thresholds_ptr() -> *const i32 { WORLD.with_borrow(|w| w.thresholds.as_ptr()) }
#[unsafe(no_mangle)] pub extern "C" fn seed(r: u8, g: u8, b: u8, dither: u32, invert: u32) {
    WORLD.with_borrow_mut(|w| { w.thresholds=[r as i32,g as i32,b as i32]; fill_seed(w,dither!=0,invert!=0); });
}
#[unsafe(no_mangle)] pub extern "C" fn seed_auto(percent: u32, dither: u32, invert: u32) {
    WORLD.with_borrow_mut(|w| {
        for c in 0..3 {
            let mut histogram=[0usize;512];let mut total=0;let mut signal=false;
            for i in 0..w.width*w.height { if w.image[i*4+3]==0 {continue;}
                let raw=w.image[i*4+c] as u32*w.image[i*4+3] as u32/255;
                signal|=if invert!=0 {raw<255} else {raw>0};
                histogram[(adjusted(w,i,c,dither!=0,invert!=0)+128) as usize]+=1;total+=1;
            }
            if total==0||!signal {w.thresholds[c]=512;continue;}
            let target=total*percent.clamp(1,99) as usize/100;
            let mut alive=0usize;let mut best_error=usize::MAX;let mut cutoff=383;
            for bin in (0..512).rev() {
                let error=alive.abs_diff(target);
                if error<best_error {best_error=error;cutoff=bin as i32-128;}
                alive+=histogram[bin];
            }
            w.thresholds[c]=cutoff;
        }
        fill_seed(w,dither!=0,invert!=0);
    });
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
    #[test] fn optimized_update_matches_reference() {
        let width=7; let height=5; let mut rng=1u32;
        for wrap in [false,true] { for _ in 0..32 {
            let mut cells=vec![0;width*height];
            for cell in &mut cells { rng=rng.wrapping_mul(1664525).wrapping_add(1013904223); *cell=(rng>>24) as u8 & 7; }
            let mut next=vec![0;width*height];advance(&cells,&mut next,width,height,wrap);
            for y in 0..height { for x in 0..width { let mut expected=0;
                for c in 0..3 { let mut n=0;
                    for dy in -1isize..=1 { for dx in -1isize..=1 {
                        if dx==0&&dy==0 {continue;}
                        let nx=x as isize+dx;let ny=y as isize+dy;
                        if !wrap&&(nx<0||ny<0||nx>=width as isize||ny>=height as isize){continue;}
                        let i=ny.rem_euclid(height as isize) as usize*width+nx.rem_euclid(width as isize) as usize;
                        n+=usize::from(cells[i]&(1<<c)!=0);
                    } }
                    if n==3||(n==2&&cells[y*width+x]&(1<<c)!=0){expected|=1<<c;}
                }
                assert_eq!(next[y*width+x],expected);
            } }
        } }
    }
}
